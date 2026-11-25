import { neon } from '@neondatabase/serverless';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpAuth } from '@neon/oauth/mcp';
import { nodeMcp } from '@neon/oauth/mcp/node';
import { z } from 'zod';

export const config = { api: { bodyParser: false } };

const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const oauthReady = Boolean(process.env.NEON_AUTH_BASE_URL && process.env.MCP_RESOURCE);
const guard = oauthReady ? nodeMcp(createMcpAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL,
  resource: process.env.MCP_RESOURCE,
}), { path: '/api/mcp' }) : null;

function assertDate(value, label) {
  if (value === undefined) return;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} debe usar el formato AAAA-MM-DD.`);
  }
}

function todayInChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function linesFor(entries, accounts, start, end) {
  return entries.filter(entry => entry.status === 'posted'
    && (!start || entry.date >= start) && (!end || entry.date <= end));
}

function amountForKind(entry, accounts, kind) {
  const kinds = new Map(accounts.map(account => [account.id, account.kind]));
  return entry.lines.reduce((sum, line) => {
    if (kinds.get(line.account) !== kind) return sum;
    return sum + (['asset', 'expense'].includes(kind) ? line.debit - line.credit : line.credit - line.debit);
  }, 0);
}

function movementAmount(entry, state) {
  const original = entry.type === 'reversal'
    ? (state.entries || []).find(item => item.id === entry.reverses) : entry;
  if (original?.type === 'income') return Math.abs(amountForKind(entry, state.accounts || [], 'income'));
  if (original?.type === 'expense') return Math.abs(amountForKind(entry, state.accounts || [], 'expense'));
  const kinds = new Map((state.accounts || []).map(account => [account.id, account.kind]));
  return Math.max(0, ...entry.lines.filter(line => ['asset', 'liability'].includes(kinds.get(line.account)))
    .map(line => Math.max(Math.abs(line.debit), Math.abs(line.credit))));
}

function balanceThrough(entries, accounts, cutoff) {
  const balances = new Map(accounts.map(account => [account.id, 0]));
  const kinds = new Map(accounts.map(account => [account.id, account.kind]));
  for (const entry of linesFor(entries, accounts, undefined, cutoff)) {
    for (const line of entry.lines) {
      const kind = kinds.get(line.account);
      if (!kind) continue;
      const delta = ['asset', 'expense'].includes(kind)
        ? line.debit - line.credit : line.credit - line.debit;
      balances.set(line.account, (balances.get(line.account) ?? 0) + delta);
    }
  }
  return balances;
}

function totalsFor(entries, accounts, start, end) {
  const relevant = linesFor(entries, accounts, start, end);
  return {
    income: relevant.reduce((sum, entry) => sum + amountForKind(entry, accounts, 'income'), 0),
    expenses: relevant.reduce((sum, entry) => sum + amountForKind(entry, accounts, 'expense'), 0),
    vatPaid: relevant.reduce((sum, entry) => sum + (entry.type === 'expense' ? entry.iva ?? 0 : entry.type === 'reversal' ? -(entry.iva ?? 0) : 0), 0),
    movementCount: relevant.length,
  };
}

function byCategory(entries, accounts, start, end, kind) {
  const relevant = linesFor(entries, accounts, start, end);
  return accounts.filter(account => account.kind === kind).map(account => ({
    category: account.name,
    amount: relevant.reduce((sum, entry) => sum + entry.lines.reduce((n, line) => {
      if (line.account !== account.id) return n;
      return n + (kind === 'income' ? line.credit - line.debit : line.debit - line.credit);
    }, 0), 0),
  })).filter(row => row.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

async function getState(subject) {
  if (process.env.FINO_PRIVATE_READY !== 'enabled' || !process.env.DATABASE_URL
    || !process.env.FINO_ALLOWED_EMAIL) throw new Error('La conexión privada de Fino aún no está configurada.');
  const sql = neon(process.env.DATABASE_URL);
  const users = await sql`SELECT email, "emailVerified" AS email_verified FROM neon_auth."user" WHERE id = ${subject} LIMIT 1`;
  const user = users[0];
  if (!user || user.email?.trim().toLowerCase() !== process.env.FINO_ALLOWED_EMAIL.trim().toLowerCase()
    || user.email_verified !== true) throw new Error('La cuenta autenticada no tiene acceso a Fino.');
  const rows = await sql`SELECT state FROM spaces WHERE space = 'personal' LIMIT 1`;
  if (!rows[0]?.state) return { accounts: [], entries: [], budgets: [], goals: [], statements: [] };
  return rows[0].state;
}

function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function makeMcpServer(state) {
  const server = new McpServer({ name: 'Fino Finanzas Personales', version: '1.0.0' });

  server.registerTool('resumen_financiero', {
    title: 'Resumen financiero',
    description: 'Entrega ingresos, gastos, IVA asociado a gastos y posición financiera para un período. Usa fechas ISO inclusivas; por defecto usa el año en curso hasta hoy.',
    inputSchema: { desde: z.string().optional(), hasta: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
    async ({ desde, hasta }) => {
      assertDate(desde, 'desde'); assertDate(hasta, 'hasta');
      if (desde && hasta && desde > hasta) throw new Error('La fecha inicial debe ser anterior a la fecha final.');
      const today = todayInChile();
      const start = desde || `${today.slice(0, 4)}-01-01`;
      const end = hasta || today;
      const period = totalsFor(state.entries || [], state.accounts || [], start, end);
      const balances = balanceThrough(state.entries || [], state.accounts || [], end);
      const assetAccounts = (state.accounts || []).filter(account => account.kind === 'asset');
      const assets = assetAccounts
        .reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
      const cash = assetAccounts.filter(account => account.profile === 'cash')
        .reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
      const valuationAssets = assetAccounts.filter(account => account.estimate !== undefined)
        .reduce((sum, account) => sum + account.estimate, 0);
      const liabilities = (state.accounts || []).filter(account => account.kind === 'liability')
        .reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
      const accumulatedVat = totalsFor(state.entries || [], state.accounts || [], undefined, end).vatPaid;
      const netWorth = assets - liabilities;
      const currentNet = period.income - period.expenses;
      return jsonResult({ currency: 'CLP', period: { from: start, to: end }, ...period,
        netIncome: currentNet, assets, liabilities, netWorth, cash,
        investmentAndOtherAssetValuations: valuationAssets, vatAccumulated: accumulatedVat,
        incomeByCategory: byCategory(state.entries || [], state.accounts || [], start, end, 'income'),
        expensesByCategory: byCategory(state.entries || [], state.accounts || [], start, end, 'expense'),
        note: 'Datos de movimientos contabilizados; IVA corresponde solo a los importes de IVA declarados en los gastos de Fino.' });
    },
  );

  server.registerTool('listar_movimientos', {
    title: 'Listar movimientos',
    description: 'Consulta movimientos contabilizados de Fino. Devuelve solo una selección acotada de campos y un máximo de 100 filas.',
    inputSchema: { desde: z.string().optional(), hasta: z.string().optional(), tipo: z.enum(['income', 'expense', 'transfer', 'reversal', 'opening']).optional(), limite: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
    async ({ desde, hasta, tipo, limite = 50 }) => {
      assertDate(desde, 'desde'); assertDate(hasta, 'hasta');
      if (desde && hasta && desde > hasta) throw new Error('La fecha inicial debe ser anterior a la fecha final.');
      const accounts = new Map((state.accounts || []).map(account => [account.id, account]));
      const entries = (state.entries || []).filter(entry => entry.status === 'posted'
        && (!desde || entry.date >= desde) && (!hasta || entry.date <= hasta) && (!tipo || entry.type === tipo))
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limite);
      return jsonResult({ count: entries.length, limit: limite, movements: entries.map(entry => ({
        date: entry.date, type: entry.type, description: entry.description,
        amount: movementAmount(entry, state),
        category: entry.lines.map(line => accounts.get(line.account)).find(account => account && ['income', 'expense'].includes(account.kind))?.name || null,
        goal: state.goals?.find(goal => goal.id === entry.goal)?.name || null,
      })) });
    },
  );

  server.registerTool('cuentas_y_deudas', {
    title: 'Cuentas y deudas',
    description: 'Muestra saldos de cuentas, activos valorizados, deuda, límites, fechas de pago y datos disponibles de estados de cuenta. No calcula cargos contractuales faltantes.',
    inputSchema: { al: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
    async ({ al } = {}) => {
      assertDate(al, 'al');
      const cutoff = al || todayInChile();
      const balances = balanceThrough(state.entries || [], state.accounts || [], cutoff);
      const accounts = (state.accounts || []).filter(account => ['asset', 'liability'].includes(account.kind));
      const data = accounts.map(account => {
        const statements = (state.statements || []).filter(statement => statement.account === account.id && statement.issueDate <= cutoff)
          .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
        const latest = statements[0];
        return {
          name: account.name, kind: account.kind, classification: account.profile,
          institution: account.institution || null, balance: balances.get(account.id) || 0,
          estimatedValue: account.estimate ?? null, valuationDate: account.valuationDate ?? null,
          creditLimit: account.limit ?? null, annualRatePercent: account.annualRateBps === undefined ? null : account.annualRateBps / 100,
          creditAvailable: account.limit === undefined ? null : Math.max(0, account.limit - (balances.get(account.id) || 0)),
          creditUtilizationPercent: !account.limit ? null : Math.round((balances.get(account.id) || 0) / account.limit * 10000) / 100,
          monthlyFee: account.monthlyFee ?? null, closingDay: account.closingDay ?? null, dueDay: account.dueDay ?? null,
          paymentAccount: accounts.find(item => item.id === account.paymentAccount)?.name || null,
          latestStatement: latest ? { issueDate: latest.issueDate, dueDate: latest.dueDate, billed: latest.billed,
            minimum: latest.minimum, interestCharged: latest.interest, interestPaid: latest.interestPaid, fees: latest.fees } : null,
          statementsCount: statements.length,
        };
      });
      return jsonResult({ asOf: cutoff, accounts: data, debtTotal: data.filter(a => a.kind === 'liability').reduce((s, a) => s + a.balance, 0),
        assetTotal: data.filter(a => a.kind === 'asset').reduce((s, a) => s + a.balance, 0),
        note: 'Saldos calculados desde movimientos contabilizados hasta la fecha indicada. La capacidad de endeudamiento no es una evaluación crediticia.' });
    },
  );

  server.registerTool('presupuestos_y_objetivos', {
    title: 'Presupuestos y objetivos',
    description: 'Consulta avance de presupuestos mensuales y objetivos con fechas, sumando movimientos asociados y contabilizados.',
    inputSchema: { mes: z.string().regex(/^\d{4}-\d{2}$/).optional(), al: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
    async ({ mes, al }) => {
      assertDate(al, 'al');
      const today = al || todayInChile();
      const selectedMonth = mes || today.slice(0, 7);
      if (Number(selectedMonth.slice(5, 7)) < 1 || Number(selectedMonth.slice(5, 7)) > 12) throw new Error('El mes debe usar AAAA-MM.');
      const monthStart = `${selectedMonth}-01`;
      const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
      const monthEnd = selectedMonth === today.slice(0, 7) ? today : `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      const categories = new Map((state.accounts || []).map(account => [account.id, account.name]));
      const monthEntries = linesFor(state.entries || [], state.accounts || [], monthStart, monthEnd);
      const budgets = (state.budgets || []).filter(budget => budget.month === selectedMonth).map(budget => {
        const account = (state.accounts || []).find(item => item.id === budget.account);
        const actual = monthEntries.reduce((sum, entry) => sum + entry.lines.reduce((n, line) => {
          if (line.account !== budget.account) return n;
          const kind = account?.kind;
          return n + (kind === 'income' ? line.credit - line.debit : line.debit - line.credit);
        }, 0), 0);
        return { category: categories.get(budget.account) || 'Cuenta', type: account?.kind || null,
          planned: budget.planned, actual, remaining: budget.planned - actual, utilizationPercent: budget.planned ? Math.round(actual / budget.planned * 10000) / 100 : null };
      });
      const goals = (state.goals || []).map(goal => {
        const associated = (state.entries || []).filter(entry => entry.status === 'posted' && entry.goal === goal.id
          && entry.date <= today && (!goal.startDate || entry.date >= goal.startDate) && (!goal.endDate || entry.date <= goal.endDate));
        const spent = associated.reduce((sum, entry) => sum + amountForKind(entry, state.accounts || [], 'expense'), 0);
        return { name: goal.name, target: goal.target, startDate: goal.startDate || null, endDate: goal.endDate || null,
          spent, remaining: goal.target - spent, utilizationPercent: Math.round(spent / goal.target * 10000) / 100 };
      });
      return jsonResult({ month: selectedMonth, budgets, goals });
    },
  );

  return server;
}

export default async function handler(request, response) {
  if (!guard || !process.env.MCP_RESOURCE || !process.env.NEON_AUTH_BASE_URL) {
    response.statusCode = 503;
    return response.end('MCP no configurado');
  }
  const authRequest = request;
  return guard(authRequest, response, async error => {
    const verified = authRequest.authResult;
    if (error || !verified) {
      response.statusCode = error ? 500 : 404;
      return response.end();
    }
    if (verified.clientId !== CHATGPT_CLIENT_ID) {
      response.statusCode = 403;
      return response.end('Cliente no autorizado');
    }
    try {
      const state = await getState(verified.sub);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await makeMcpServer(state).connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'No se pudo consultar la información personal de Fino.' }));
    }
  });
}
