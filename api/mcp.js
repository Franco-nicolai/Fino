import { neon } from '@neondatabase/serverless';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpAuth } from '@neon/oauth/mcp';
import { nodeMcp } from '@neon/oauth/mcp/node';
import { z } from 'zod';

export const config = { api: { bodyParser: false } };

const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const oauthReady = Boolean(process.env.NEON_AUTH_BASE_URL && process.env.MCP_RESOURCE);
const guard = oauthReady
  ? nodeMcp(createMcpAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    resource: process.env.MCP_RESOURCE,
  }), { path: '/api/mcp' })
  : null;

function todayInChile() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function assertDate(value, name) {
  if (value === undefined) return;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00Z') : null;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(name + ' debe usar el formato AAAA-MM-DD.');
  }
}

function postedIn(entries, start, end) {
  return (entries || []).filter(entry => entry.status === 'posted'
    && (!start || entry.date >= start) && (!end || entry.date <= end));
}

function accountKindMap(accounts) {
  return new Map((accounts || []).map(account => [account.id, account.kind]));
}

function amountByKind(entry, kinds, kind) {
  return (entry.lines || []).reduce((sum, line) => {
    if (kinds.get(line.account) !== kind) return sum;
    return sum + (['asset', 'expense'].includes(kind)
      ? line.debit - line.credit : line.credit - line.debit);
  }, 0);
}

function movementAmount(entry, state, kinds) {
  const original = entry.type === 'reversal'
    ? (state.entries || []).find(item => item.id === entry.reverses) : entry;
  if (original?.type === 'income') return Math.abs(amountByKind(entry, kinds, 'income'));
  if (original?.type === 'expense') return Math.abs(amountByKind(entry, kinds, 'expense'));
  return Math.max(0, ...(entry.lines || [])
    .filter(line => ['asset', 'liability'].includes(kinds.get(line.account)))
    .map(line => Math.max(Math.abs(line.debit), Math.abs(line.credit))));
}

function balancesThrough(state, end) {
  const balances = new Map((state.accounts || []).map(account => [account.id, 0]));
  const kinds = accountKindMap(state.accounts);
  for (const entry of postedIn(state.entries, undefined, end)) {
    for (const line of entry.lines || []) {
      const kind = kinds.get(line.account);
      if (!kind) continue;
      const delta = ['asset', 'expense'].includes(kind)
        ? line.debit - line.credit : line.credit - line.debit;
      balances.set(line.account, (balances.get(line.account) || 0) + delta);
    }
  }
  return balances;
}

function categoryTotals(state, start, end, kind) {
  const entries = postedIn(state.entries, start, end);
  const kinds = accountKindMap(state.accounts);
  return (state.accounts || []).filter(account => account.kind === kind).map(account => ({
    category: account.name,
    amount: entries.reduce((sum, entry) => sum + (entry.lines || []).reduce((subtotal, line) => {
      if (line.account !== account.id) return subtotal;
      return subtotal + (kind === 'income' ? line.credit - line.debit : line.debit - line.credit);
    }, 0), 0),
  })).filter(item => item.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function periodTotals(state, start, end) {
  const entries = postedIn(state.entries, start, end);
  const kinds = accountKindMap(state.accounts);
  return {
    income: entries.reduce((sum, entry) => sum + amountByKind(entry, kinds, 'income'), 0),
    expenses: entries.reduce((sum, entry) => sum + amountByKind(entry, kinds, 'expense'), 0),
    vatPaid: entries.reduce((sum, entry) => sum
      + (entry.type === 'expense' ? (entry.iva || 0) : entry.type === 'reversal' ? -(entry.iva || 0) : 0), 0),
    movementCount: entries.length,
  };
}

async function getPersonalState(subject) {
  const allowedEmail = process.env.FINO_ALLOWED_EMAIL?.trim().toLowerCase();
  if (process.env.FINO_PRIVATE_READY !== 'enabled' || !process.env.DATABASE_URL || !allowedEmail) {
    throw new Error('El acceso privado de Fino aún no está configurado.');
  }
  const sql = neon(process.env.DATABASE_URL);
  const users = await sql`SELECT email, "emailVerified" AS email_verified FROM neon_auth."user" WHERE id = ${subject} LIMIT 1`;
  const user = users[0];
  if (!user || user.email?.trim().toLowerCase() !== allowedEmail || user.email_verified !== true) {
    throw new Error('La cuenta autenticada no está autorizada para Fino.');
  }
  const rows = await sql`SELECT state FROM spaces WHERE space = 'personal' LIMIT 1`;
  return rows[0]?.state || { accounts: [], entries: [], budgets: [], goals: [], statements: [] };
}

function result(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function buildServer(state) {
  const server = new McpServer({ name: 'Fino Finanzas Personales', version: '1.0.0' });
  const readonly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool('resumen_financiero', {
    title: 'Resumen financiero',
    description: 'Resume ingresos, gastos, IVA declarado en gastos y posición financiera. Fechas ISO inclusivas; sin fechas usa el año actual hasta hoy.',
    inputSchema: { desde: z.string().optional(), hasta: z.string().optional() },
    annotations: readonly,
  }, async ({ desde, hasta }) => {
    assertDate(desde, 'desde'); assertDate(hasta, 'hasta');
    if (desde && hasta && desde > hasta) throw new Error('La fecha inicial debe ser anterior a la fecha final.');
    const today = todayInChile();
    const start = desde || today.slice(0, 4) + '-01-01';
    const end = hasta || today;
    const totals = periodTotals(state, start, end);
    const balances = balancesThrough(state, end);
    const assets = (state.accounts || []).filter(account => account.kind === 'asset');
    const liabilities = (state.accounts || []).filter(account => account.kind === 'liability');
    const assetTotal = assets.reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
    const liabilityTotal = liabilities.reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
    const cash = assets.filter(account => account.profile === 'cash')
      .reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
    const declaredAssetValuations = assets.filter(account => account.estimate !== undefined)
      .reduce((sum, account) => sum + account.estimate, 0);
    const vatAccumulated = periodTotals(state, undefined, end).vatPaid;
    return result({
      currency: 'CLP', period: { from: start, to: end }, ...totals,
      netIncome: totals.income - totals.expenses,
      cash, assets: assetTotal, liabilities: liabilityTotal, netWorth: assetTotal - liabilityTotal,
      declaredAssetValuations, vatAccumulated,
      incomeByCategory: categoryTotals(state, start, end, 'income'),
      expensesByCategory: categoryTotals(state, start, end, 'expense'),
      note: 'Saldos desde movimientos contabilizados. El IVA proviene de los importes declarados en Fino; las valorizaciones declaradas se muestran aparte del saldo contable.',
    });
  });

  server.registerTool('listar_movimientos', {
    title: 'Listar movimientos',
    description: 'Consulta movimientos contabilizados con un máximo de 100 filas y sin exponer identificadores internos.',
    inputSchema: {
      desde: z.string().optional(), hasta: z.string().optional(),
      tipo: z.enum(['income', 'expense', 'transfer', 'reversal', 'opening']).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
    annotations: readonly,
  }, async ({ desde, hasta, tipo, limite = 50 }) => {
    assertDate(desde, 'desde'); assertDate(hasta, 'hasta');
    if (desde && hasta && desde > hasta) throw new Error('La fecha inicial debe ser anterior a la fecha final.');
    const kinds = accountKindMap(state.accounts);
    const accounts = new Map((state.accounts || []).map(account => [account.id, account]));
    const entries = (state.entries || []).filter(entry => entry.status === 'posted'
      && (!desde || entry.date >= desde) && (!hasta || entry.date <= hasta) && (!tipo || entry.type === tipo))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limite);
    return result({
      count: entries.length, limit: limite,
      movements: entries.map(entry => ({
        date: entry.date, type: entry.type, description: entry.description,
        amount: movementAmount(entry, state, kinds),
        category: (entry.lines || []).map(line => accounts.get(line.account))
          .find(account => account && ['income', 'expense'].includes(account.kind))?.name || null,
        goal: state.goals?.find(goal => goal.id === entry.goal)?.name || null,
      })),
    });
  });

  server.registerTool('cuentas_y_deudas', {
    title: 'Cuentas y deudas',
    description: 'Consulta saldos, valorizaciones, cupos, vencimientos, tasas y estados de cuenta capturados en Fino.',
    inputSchema: { al: z.string().optional() },
    annotations: readonly,
  }, async ({ al } = {}) => {
    assertDate(al, 'al');
    const cutoff = al || todayInChile();
    const balances = balancesThrough(state, cutoff);
    const accounts = state.accounts || [];
    const rows = accounts.filter(account => ['asset', 'liability'].includes(account.kind)).map(account => {
      const statements = (state.statements || []).filter(statement => statement.account === account.id && statement.issueDate <= cutoff)
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
      const latest = statements[0];
      const balance = balances.get(account.id) || 0;
      return {
        name: account.name, kind: account.kind, classification: account.profile,
        institution: account.institution || null, balance,
        estimatedValue: account.estimate ?? null, valuationDate: account.valuationDate ?? null,
        creditLimit: account.limit ?? null,
        creditAvailable: account.limit === undefined ? null : Math.max(0, account.limit - balance),
        creditUtilizationPercent: !account.limit ? null : Math.round(balance / account.limit * 10000) / 100,
        annualRatePercent: account.annualRateBps === undefined ? null : account.annualRateBps / 100,
        monthlyFee: account.monthlyFee ?? null, closingDay: account.closingDay ?? null, dueDay: account.dueDay ?? null,
        paymentAccount: accounts.find(item => item.id === account.paymentAccount)?.name || null,
        latestStatement: latest ? {
          issueDate: latest.issueDate, dueDate: latest.dueDate, billed: latest.billed,
          minimum: latest.minimum, interestCharged: latest.interest, interestPaid: latest.interestPaid, fees: latest.fees,
        } : null,
        statementsCount: statements.length,
      };
    });
    return result({
      asOf: cutoff, accounts: rows,
      debtTotal: rows.filter(account => account.kind === 'liability').reduce((sum, account) => sum + account.balance, 0),
      assetTotal: rows.filter(account => account.kind === 'asset').reduce((sum, account) => sum + account.balance, 0),
      note: 'La capacidad de endeudamiento no es una evaluación crediticia.',
    });
  });

  server.registerTool('presupuestos_y_objetivos', {
    title: 'Presupuestos y objetivos',
    description: 'Consulta presupuestos mensuales y avance de objetivos asociados a gastos contabilizados.',
    inputSchema: { mes: z.string().regex(/^\d{4}-\d{2}$/).optional(), al: z.string().optional() },
    annotations: readonly,
  }, async ({ mes, al }) => {
    assertDate(al, 'al');
    const today = al || todayInChile();
    const selectedMonth = mes || today.slice(0, 7);
    const numericMonth = Number(selectedMonth.slice(5, 7));
    if (numericMonth < 1 || numericMonth > 12) throw new Error('El mes debe usar AAAA-MM.');
    const lastDay = new Date(Number(selectedMonth.slice(0, 4)), numericMonth, 0).getDate();
    const start = selectedMonth + '-01';
    const end = selectedMonth === today.slice(0, 7) ? today : selectedMonth + '-' + String(lastDay).padStart(2, '0');
    const monthlyEntries = postedIn(state.entries, start, end);
    const accounts = new Map((state.accounts || []).map(account => [account.id, account]));
    const budgets = (state.budgets || []).filter(budget => budget.month === selectedMonth).map(budget => {
      const account = accounts.get(budget.account);
      const actual = monthlyEntries.reduce((sum, entry) => sum + (entry.lines || []).reduce((subtotal, line) => {
        if (line.account !== budget.account) return subtotal;
        return subtotal + (account?.kind === 'income' ? line.credit - line.debit : line.debit - line.credit);
      }, 0), 0);
      return {
        category: account?.name || 'Cuenta', type: account?.kind || null,
        planned: budget.planned, actual, remaining: budget.planned - actual,
        utilizationPercent: budget.planned ? Math.round(actual / budget.planned * 10000) / 100 : null,
      };
    });
    const kinds = accountKindMap(state.accounts);
    const goals = (state.goals || []).map(goal => {
      const entries = (state.entries || []).filter(entry => entry.status === 'posted' && entry.goal === goal.id
        && entry.date <= today && (!goal.startDate || entry.date >= goal.startDate)
        && (!goal.endDate || entry.date <= goal.endDate));
      const spent = entries.reduce((sum, entry) => sum + amountByKind(entry, kinds, 'expense'), 0);
      return {
        name: goal.name, target: goal.target, startDate: goal.startDate || null, endDate: goal.endDate || null,
        spent, remaining: goal.target - spent,
        utilizationPercent: Math.round(spent / goal.target * 10000) / 100,
      };
    });
    return result({ month: selectedMonth, budgets, goals });
  });

  return server;
}

export default async function handler(request, response) {
  if (!guard || process.env.FINO_PRIVATE_READY !== 'enabled' || !process.env.DATABASE_URL) {
    response.statusCode = 503;
    return response.end('MCP no configurado');
  }
  return guard(request, response, async error => {
    const verified = request.authResult;
    if (error || !verified) {
      response.statusCode = error ? 500 : 404;
      return response.end();
    }
    if (verified.clientId !== CHATGPT_CLIENT_ID) {
      response.statusCode = 403;
      return response.end('Solo se admite el cliente oficial de ChatGPT.');
    }
    try {
      const state = await getPersonalState(verified.sub);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await buildServer(state).connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'No se pudo consultar la información de Fino.' }));
    }
  });
}
