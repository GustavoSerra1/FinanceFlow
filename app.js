"use strict";
const CATEGORIES = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Contas', 'Outros'];
const PALETTE = ['#2563eb', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b', '#10b981', '#a855f7'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const now = () => new Date();
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const currentMonth = () => isoLocal(now()).slice(0, 7);
const monthOf = (date) => date.slice(0, 7);
function addMonth(m, step) { let [y, mo] = m.split('-').map(Number); return `${new Date(y, mo - 1 + step, 1).getFullYear()}-${String(new Date(y, mo - 1 + step, 1).getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} de ${y}`; }
function money(n) { return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function amountToCents(s) {
    let n;
    if (typeof s === 'number')
        n = s;
    else {
        let value = String(s).trim().replace(/\s/g, '').replace(/^R\$/, '');
        if (value.includes(','))
            value = value.replace(/\./g, '').replace(',', '.');
        n = Number(value);
    }
    if (!Number.isFinite(n) || n < 0 || n > 1e10)
        return NaN;
    return Math.round(n * 100);
}
function percent(n) { return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`; }
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const active = (start, end, m) => start <= m && (!end || m <= end);
const incomeForMonth = (i, m) => i.recurring ? active(i.startMonth, i.endMonth, m) : monthOf(i.date) === m;
const fixedForMonth = (f, m) => active(f.startMonth, f.endMonth, m);
const sum = (a, value) => a.reduce((v, x) => v + value(x), 0);
function newData() { return { version: 1, setup: false, percent: 20, percentVersions: [], incomes: [], fixed: [], expenses: [], goals: [], movements: [], created: isoLocal(now()) }; }
function selectedIncomes(d, m) { return d.incomes.filter(x => incomeForMonth(x, m)); }
function selectedFixed(d, m) { return d.fixed.filter(x => fixedForMonth(x, m)); }
function selectedExpenses(d, m) { return d.expenses.filter(x => monthOf(x.date) === m); }
function selectedMovements(d, m) { return d.movements.filter(x => monthOf(x.date) === m); }
function effectivePercent(d, m) { const candidates = (d.percentVersions || []).filter(x => x.startMonth <= m).sort((a, b) => b.startMonth.localeCompare(a.startMonth)); return candidates.length ? candidates[0].percent : d.percent; }
function calc(d, m) {
    const income = sum(selectedIncomes(d, m), x => x.amount);
    const fixed = sum(selectedFixed(d, m), x => x.amount);
    const variable = sum(selectedExpenses(d, m), x => x.amount);
    const expenses = fixed + variable;
    const target = Math.round(income * effectivePercent(d, m) / 100);
    const saved = sum(selectedMovements(d, m), x => x.kind === 'deposit' ? x.amount : x.kind === 'withdraw' ? -x.amount : 0);
    return { income, fixed, variable, expenses, balance: income - expenses, target, afterTarget: income - expenses - target, saved, availableToSpend: income - target, committed: income ? expenses / income * 100 : 0, savingProgress: target ? Math.max(0, Math.min(100, saved / target * 100)) : (saved > 0 ? 100 : 0) };
}
function breakdown(d, m) { const items = {}; for (const f of selectedFixed(d, m))
    items[f.category] = (items[f.category] || 0) + f.amount; for (const e of selectedExpenses(d, m))
    items[e.category] = (items[e.category] || 0) + e.amount; return Object.entries(items).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function goalBalance(d, goalId) { let balance = goalId === null ? 0 : (d.goals.find(g => g.id === goalId)?.initial || 0); for (const x of d.movements) {
    if (x.kind === 'deposit' && x.toGoal === goalId)
        balance += x.amount;
    else if (x.kind === 'withdraw' && x.fromGoal === goalId)
        balance -= x.amount;
    else if (x.kind === 'transfer') {
        if (x.fromGoal === goalId)
            balance -= x.amount;
        if (x.toGoal === goalId)
            balance += x.amount;
    }
} return balance; }
function alerts(d, m) {
    const a = [];
    const v = calc(d, m);
    const p = calc(d, addMonth(m, -1));
    if (v.income === 0 && v.expenses > 0)
        a.push({ level: 'danger', message: 'Há despesas cadastradas, mas nenhuma receita registrada neste mês.' });
    if (v.afterTarget < 0)
        a.push({ level: 'danger', message: `Seu orçamento após a meta está negativo em ${money(-v.afterTarget)}.` });
    if (v.income > 0 && v.availableToSpend > 0 && v.expenses / v.availableToSpend >= 0.8)
        a.push({ level: 'warning', message: `Você já utilizou ${percent(v.expenses / v.availableToSpend * 100)} do orçamento destinado a despesas.` });
    if (v.income > 0 && v.fixed / v.income >= 0.5)
        a.push({ level: 'warning', message: `Despesas fixas representam ${percent(v.fixed / v.income * 100)} da renda.` });
    if (v.income > 0 && v.saved < v.target)
        a.push({ level: 'info', message: `Faltam ${money(v.target - v.saved)} em depósitos líquidos para alcançar a economia planejada.` });
    if (v.target > 0 && v.saved >= v.target)
        a.push({ level: 'success', message: 'Você alcançou sua meta mensal de economia!' });
    const cat = breakdown(d, m), prev = breakdown(d, addMonth(m, -1));
    for (const c of cat) {
        const old = prev.find(x => x.name === c.name)?.value || 0;
        if (old > 0 && c.value >= old * 1.25 && c.value - old >= 5000) {
            a.push({ level: 'warning', message: `Gastos com ${c.name.toLowerCase()} aumentaram ${percent((c.value / old - 1) * 100)} em relação ao mês anterior.` });
            break;
        }
    }
    if (m === currentMonth())
        for (const f of selectedFixed(d, m)) {
            if (f.paidMonths.includes(m))
                continue;
            const [y, mo] = m.split('-').map(Number);
            const due = isoLocal(new Date(y, mo - 1, Math.min(f.dueDay, new Date(y, mo, 0).getDate())));
            const days = Math.round((new Date(`${due}T12:00:00`).getTime() - new Date(`${isoLocal(now())}T12:00:00`).getTime()) / 86400000);
            if (days >= 0 && days <= 5)
                a.push({ level: 'info', message: `${f.description} vence em ${days === 0 ? 'hoje' : `${days} dia(s)`}: ${money(f.amount)}.` });
            else if (days < 0)
                a.push({ level: 'danger', message: `${f.description} está ${-days} dia(s) além do vencimento e segue pendente.` });
        }
    return a.slice(0, 8);
}
function financeHistory(d, m, count = 12) { return Array.from({ length: count }, (_, i) => { const key = addMonth(m, i - count + 1); return { month: key, label: MONTHS[Number(key.slice(5)) - 1].slice(0, 3), ...calc(d, key) }; }); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)); }
function ensureAmount(v) { const cents = amountToCents(v); if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1e12)
    throw new Error('Informe um valor válido maior que zero.'); return cents; }
function validateData(x) {
    if (!x || typeof x !== 'object' || x.version !== 1 || typeof x.setup !== 'boolean' || !Number.isInteger(x.percent) || x.percent < 0 || x.percent > 100)
        throw new Error('Formato de backup ou percentual inválido.');
    if (x.percentVersions !== undefined && (!Array.isArray(x.percentVersions) || x.percentVersions.length > 5000 || x.percentVersions.some((v) => typeof v?.startMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.startMonth) || !Number.isInteger(v.percent) || v.percent < 0 || v.percent > 100)))
        throw new Error('Histórico de percentuais inválido.');
    const names = ['incomes', 'fixed', 'expenses', 'goals', 'movements'];
    for (const n of names)
        if (!Array.isArray(x[n]) || x[n].length > 50000)
            throw new Error(`Lista inválida: ${n}.`);
    const ids = new Set();
    const moneyValid = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e12;
    const dateValid = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime()) && isoLocal(new Date(`${s}T12:00:00`)) === s;
    const monthValid = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
    const nameValid = (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 160;
    const idValid = (a) => { if (typeof a.id !== 'string' || !a.id || a.id.length > 120 || ids.has(a.id))
        throw new Error('Identificador duplicado ou inválido no backup.'); ids.add(a.id); };
    for (const a of x.incomes) {
        idValid(a);
        if (!nameValid(a.description) || !moneyValid(a.amount) || !dateValid(a.date) || typeof a.recurring !== 'boolean' || !monthValid(a.startMonth) || a.endMonth !== undefined && !monthValid(a.endMonth) || !['Salário', 'Renda extra', 'Freelance', 'Outras receitas'].includes(a.kind))
            throw new Error('Receita inválida no backup.');
    }
    for (const a of x.fixed) {
        idValid(a);
        if (!nameValid(a.description) || !moneyValid(a.amount) || typeof a.seriesId !== 'string' || !a.seriesId || !nameValid(a.category) || !Number.isInteger(a.dueDay) || a.dueDay < 1 || a.dueDay > 31 || !monthValid(a.startMonth) || a.endMonth !== undefined && !monthValid(a.endMonth) || !Array.isArray(a.paidMonths) || a.paidMonths.some((v) => !monthValid(v)))
            throw new Error('Despesa fixa inválida no backup.');
    }
    const series = new Map();
    for (const xfixed of x.fixed) {
        const arr = series.get(xfixed.seriesId) || [];
        arr.push({ start: xfixed.startMonth, end: xfixed.endMonth || '9999-12' });
        series.set(xfixed.seriesId, arr);
    }
    for (const [, arr] of series) {
        arr.sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 1; i < arr.length; i++)
            if (arr[i].start <= arr[i - 1].end)
                throw new Error('Despesas recorrentes sobrepostas no backup.');
    }
    for (const a of x.expenses) {
        idValid(a);
        if (!nameValid(a.description) || !moneyValid(a.amount) || !nameValid(a.category) || !dateValid(a.date))
            throw new Error('Gasto inválido no backup.');
    }
    for (const a of x.goals) {
        idValid(a);
        if (a.archived !== undefined && typeof a.archived !== 'boolean')
            throw new Error('Estado da meta inválido.');
        if (!nameValid(a.name) || !moneyValid(a.target) || a.target <= 0 || !moneyValid(a.initial) || !dateValid(a.startDate) || a.dueDate !== undefined && !dateValid(a.dueDate))
            throw new Error('Meta inválida no backup.');
    }
    const goalIds = new Set(x.goals.map((g) => g.id));
    for (const a of x.movements) {
        idValid(a);
        if (!dateValid(a.date) || !['deposit', 'withdraw', 'transfer'].includes(a.kind) || !moneyValid(a.amount) || a.amount <= 0 || !(a.fromGoal === null || goalIds.has(a.fromGoal)) || !(a.toGoal === null || goalIds.has(a.toGoal)) || typeof a.note !== 'string' || a.note.length > 500 || a.kind === 'transfer' && a.fromGoal === a.toGoal)
            throw new Error('Movimentação inválida no backup.');
    }
    return JSON.parse(JSON.stringify(x));
}
/* FinanceFlow — camada de persistência isolada; preparada para troca futura por API. */
const DB_NAME = 'financeflow-db';
const DB_STORE = 'documents';
const DB_KEY = 'primary';
let storageMode = 'indexeddb';
async function storageLoad() {
    try {
        const db = await openDB();
        const x = await new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readonly'); const r = tx.objectStore(DB_STORE).get(DB_KEY); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        db.close();
        return x ? validateData(x) : newData();
    }
    catch (e) {
        storageMode = 'localStorage';
        try {
            const v = localStorage.getItem('financeflow-backup');
            return v ? validateData(JSON.parse(v)) : newData();
        }
        catch {
            return newData();
        }
    }
}
function openDB() { return new Promise((resolve, reject) => { if (!('indexedDB' in window))
    return reject(new Error('IndexedDB indisponível')); const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(DB_STORE))
    db.createObjectStore(DB_STORE); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function storageSave(d) {
    if (storageMode === 'localStorage') {
        localStorage.setItem('financeflow-backup', JSON.stringify(d));
        return;
    }
    const db = await openDB();
    try {
        await new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(d, DB_KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    }
    finally {
        db.close();
    }
}
const cloudSettings = (window.FINANCEFLOW_CONFIG || { supabaseUrl: '', publishableKey: '' });
const cloudUrl = cloudSettings.supabaseUrl.replace(/\/$/, '');
const cloudKey = cloudSettings.publishableKey;
let cloudState = 'loading';
let cloudSession = null;
let cloudRevision = 0;
let cloudDirty = false;
let cloudSeq = 0;
let cloudQueue = Promise.resolve();
let cloudRemote = null;
let cloudAuthMode = 'login';
let cloudMessage = '';
let cloudBusy = false;
let cloudSyncing = false;
let cloudChecking = false;
let cloudResetToken = false;
const CLOUD_SESSION_KEY = 'financeflow-cloud-session';
const cloudCacheKey = (id) => `financeflow-cloud-cache:${id}`;
function cloudValidConfig() {
    try {
        const u = new URL(cloudUrl);
        return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && cloudKey.startsWith('sb_publishable_');
    }
    catch {
        return false;
    }
}
function cloudReadSession() {
    try {
        const raw = localStorage.getItem(CLOUD_SESSION_KEY);
        if (!raw)
            return null;
        const s = JSON.parse(raw);
        if (typeof s.access_token === 'string' && typeof s.refresh_token === 'string' && typeof s.user?.id === 'string')
            return s;
    }
    catch { }
    return null;
}
function cloudKeepSession(s) {
    if (typeof s.access_token !== 'string' || typeof s.refresh_token !== 'string' || typeof s.user?.id !== 'string')
        throw new Error('Sessão inválida.');
    cloudSession = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Number(s.expires_at) || Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600), user: { id: s.user.id, email: s.user.email } };
    localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(cloudSession));
}
function cloudReadCache(id) {
    try {
        const raw = localStorage.getItem(cloudCacheKey(id));
        if (!raw)
            return null;
        const v = JSON.parse(raw);
        return { payload: validateData(v.payload), revision: Number(v.revision) || 0, dirty: v.dirty === true };
    }
    catch {
        return null;
    }
}
function cloudKeepCache(payload, dirty) {
    if (!cloudSession)
        return;
    try {
        localStorage.setItem(cloudCacheKey(cloudSession.user.id), JSON.stringify({ payload, dirty, revision: cloudRevision }));
    }
    catch (e) {
        console.warn('Sem espaço para cache de recuperação', e);
    }
}
async function cloudApi(path, options = {}, auth = true, retry = true) {
    if (auth && cloudSession && cloudSession.expires_at < Date.now() / 1000 + 45)
        await cloudRefresh();
    const headers = { apikey: cloudKey, 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (auth && cloudSession)
        headers.Authorization = `Bearer ${cloudSession.access_token}`;
    let response;
    try {
        response = await fetch(`${cloudUrl}${path}`, { ...options, headers, cache: 'no-store' });
    }
    catch {
        throw new Error('Sem conexão com a nuvem. Seus dados não foram apagados.');
    }
    if (response.status === 401 && auth && retry && cloudSession) {
        await cloudRefresh();
        return cloudApi(path, options, auth, false);
    }
    const bodyText = await response.text();
    let value = null;
    try {
        value = bodyText ? JSON.parse(bodyText) : null;
    }
    catch {
        value = bodyText;
    }
    if (!response.ok) {
        const msg = typeof value?.message === 'string' ? value.message : typeof value?.msg === 'string' ? value.msg : typeof value?.error_description === 'string' ? value.error_description : typeof value?.error === 'string' ? value.error : `Erro HTTP ${response.status}`;
        if (/SYNC_CONFLICT/.test(msg))
            throw new Error('SYNC_CONFLICT');
        throw new Error(msg);
    }
    return value;
}
let cloudRefreshPromise = null;
async function cloudRefresh() {
    if (cloudRefreshPromise)
        return cloudRefreshPromise;
    cloudRefreshPromise = (async () => {
        if (!cloudSession)
            throw new Error('Faça login novamente.');
        const s = await cloudApi('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: cloudSession.refresh_token }) }, false);
        cloudKeepSession(s);
    })();
    try {
        await cloudRefreshPromise;
    }
    finally {
        cloudRefreshPromise = null;
    }
}
function cloudRecoveryHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!h.has('access_token') || !h.has('refresh_token'))
        return false;
    try {
        const jwt = String(h.get('access_token'));
        const body = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (typeof body.sub !== 'string')
            throw new Error('Token inválido');
        cloudKeepSession({ access_token: jwt, refresh_token: h.get('refresh_token'), expires_in: Number(h.get('expires_in') || 3600), user: { id: body.sub, email: body.email } });
        cloudResetToken = h.get('type') === 'recovery';
        history.replaceState(null, '', location.pathname + location.search);
        return true;
    }
    catch {
        return false;
    }
}
async function cloudStart() {
    if (!cloudValidConfig()) {
        cloudState = 'config';
        render();
        return;
    }
    cloudRecoveryHash();
    cloudSession = cloudSession || cloudReadSession();
    if (!cloudSession) {
        cloudState = 'auth';
        render();
        return;
    }
    if (cloudResetToken) {
        cloudState = 'reset';
        render();
        return;
    }
    cloudState = 'loading';
    render();
    try {
        const u = await cloudApi('/auth/v1/user');
        if (u?.id !== cloudSession.user.id)
            throw new Error('A conta conectada não corresponde à sessão.');
        await cloudOpen();
    }
    catch (e) {
        cloudState = 'error';
        cloudMessage = String(e.message || e);
        render();
    }
}
async function cloudLoadDoc() {
    if (!cloudSession)
        throw new Error('Sessão encerrada.');
    const rows = await cloudApi(`/rest/v1/financeflow_documents?select=payload,revision&user_id=eq.${encodeURIComponent(cloudSession.user.id)}`, { method: 'GET' });
    if (!Array.isArray(rows))
        throw new Error('Resposta inesperada do banco de dados.');
    if (!rows.length)
        return null;
    return { payload: validateData(rows[0].payload), revision: Number(rows[0].revision) };
}
async function cloudOpen() {
    if (!cloudSession)
        return;
    const remote = await cloudLoadDoc();
    const cached = cloudReadCache(cloudSession.user.id);
    cloudRevision = remote?.revision || 0;
    cloudState = 'ready';
    if (cached?.dirty) {
        data = cached.payload;
        cloudDirty = true;
        if (cached.revision !== cloudRevision) {
            cloudRemote = remote || { payload: newData(), revision: 0 };
            cloudState = 'conflict';
            render();
            return;
        }
        render();
        void cloudTrySync();
        return;
    }
    data = remote?.payload || newData();
    cloudDirty = false;
    cloudKeepCache(data, false);
    page = 'dashboard';
    month = currentMonth();
    render();
}
function cloudAuthHTML() {
    const configHelp = cloudState === 'config' ? `<h1>Configure a conexão</h1><p>Preencha o arquivo <strong>config.js</strong> com o endereço HTTPS do seu projeto Supabase e a chave <strong>sb_publishable_...</strong>. Nunca utilize uma chave secreta.</p><p>Abra o <strong>GUIA-DE-INSTALACAO.md</strong> para configurar o banco de dados.</p>` : '';
    const errorHelp = cloudState === 'error' ? `<h1>Não foi possível conectar</h1><p>${escapeHtml(cloudMessage || 'Verifique sua conexão e as configurações do banco.')}</p><button class="btn primary full" data-action="cloud-retry">Tentar novamente</button><button class="btn ghost full" data-action="cloud-exit">Trocar de conta</button>` : '';
    const conflictHelp = cloudState === 'conflict' ? `<h1>Alterações em dois dispositivos</h1><p>Existem alterações locais ainda não sincronizadas e outra versão já foi salva na nuvem. Para proteger seu histórico, o FinanceFlow não vai sobrescrever uma versão automaticamente.</p><div class="cloud-warning">Primeiro baixe o backup das alterações deste aparelho. Depois escolha carregar a versão da nuvem.</div><button class="btn primary full" data-action="cloud-export">1. Baixar backup das alterações</button><button class="btn secondary full" data-action="cloud-discard">2. Carregar versão da nuvem</button>` : '';
    const resetHelp = cloudState === 'reset' ? `<form id="cloud-reset-form"><h1>Defina uma nova senha</h1><p>Sua solicitação de recuperação foi validada.</p>${input('password', 'Nova senha', 'password', '', 'required minlength="8" autocomplete="new-password"')}<button class="btn primary full" type="submit">Salvar nova senha</button></form>` : '';
    const passwordAutocomplete = cloudAuthMode === 'login' ? 'current-password' : 'new-password';
    const authHelp = cloudState === 'auth' ? `<form id="cloud-auth-form"><h1>${cloudAuthMode === 'login' ? 'Acesse suas finanças' : 'Crie sua conta gratuita'}</h1><p>Suas receitas, despesas e metas sincronizadas no celular e no computador.</p>${input('email', 'Seu e-mail', 'email', '', 'required autocomplete="email"')}${input('password', 'Senha', 'password', '', `required minlength="8" autocomplete="${passwordAutocomplete}"`)}<button type="submit" class="btn primary full" ${cloudBusy ? 'disabled' : ''}>${cloudBusy ? 'Conectando...' : cloudAuthMode === 'login' ? 'Entrar' : 'Criar conta'}</button></form><button class="btn ghost full" data-action="cloud-switch">${cloudAuthMode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}</button>${cloudAuthMode === 'login' ? '<button class="btn ghost full" data-action="cloud-forgot">Esqueci minha senha</button>' : ''}` : '';
    const waiting = cloudState === 'loading' ? '<h1>Sincronizando seus dados...</h1><p>Conectando à sua conta protegida.</p>' : '';
    return `<div class="onboarding-shell cloud-auth"><div class="onboarding-brand"><div class="brand-mark">${ic('chart-no-axes-combined', 23)}</div><strong>Finance<span>Flow</span></strong></div><div class="onboarding-card"><div class="onboard-icon">${ic('shield', 29)}</div>${configHelp}${errorHelp}${conflictHelp}${resetHelp}${authHelp}${waiting}${cloudMessage && cloudState === 'auth' ? `<p class="cloud-message">${escapeHtml(cloudMessage)}</p>` : ''}</div><p class="onboard-foot">${ic('lock', 15)} Seu espaço financeiro privado. Nunca informe senhas pelo chat.</p></div>`;
}
async function cloudAuthSubmit(form) {
    if (cloudBusy)
        return;
    const fields = new FormData(form), email = String(fields.get('email') || '').trim(), password = String(fields.get('password') || '');
    if (!email || password.length < 8) {
        cloudMessage = 'Informe um e-mail e senha com pelo menos 8 caracteres.';
        render();
        return;
    }
    cloudBusy = true;
    cloudMessage = '';
    render();
    try {
        const path = cloudAuthMode === 'signup' ? `/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin + location.pathname)}` : '/auth/v1/token?grant_type=password';
        const result = await cloudApi(path, { method: 'POST', body: JSON.stringify({ email, password }) }, false);
        if (result?.access_token || result?.session?.access_token) {
            cloudKeepSession(result.session || result);
            await cloudOpen();
        }
        else {
            cloudAuthMode = 'login';
            cloudState = 'auth';
            cloudMessage = 'Conta criada. Confira seu e-mail para confirmar o cadastro e depois faça login.';
        }
    }
    catch (e) {
        cloudMessage = String(e.message || e);
    }
    finally {
        cloudBusy = false;
        render();
    }
}
async function cloudForgot() {
    const email = prompt('Digite o e-mail da conta para receber um link de recuperação:');
    if (!email)
        return;
    try {
        await cloudApi(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', body: JSON.stringify({ email }) }, false);
        cloudMessage = 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.';
    }
    catch (e) {
        cloudMessage = e.message;
    }
    render();
}
async function cloudChangePassword(form) {
    const pw = String(new FormData(form).get('password') || '');
    if (pw.length < 8)
        return;
    try {
        await cloudApi('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: pw }) });
        cloudResetToken = false;
        cloudMessage = 'Senha atualizada.';
        await cloudOpen();
    }
    catch (e) {
        cloudMessage = e.message;
        render();
    }
}
async function cloudLogout() {
    if (cloudDirty && !confirm('Existem alterações não sincronizadas. Exporte um backup JSON antes de sair. Deseja realmente sair?'))
        return;
    try {
        if (cloudSession)
            await cloudApi('/auth/v1/logout', { method: 'POST' });
    }
    catch { }
    cloudSession = null;
    localStorage.removeItem(CLOUD_SESSION_KEY);
    cloudState = 'auth';
    cloudAuthMode = 'login';
    cloudMessage = '';
    cloudDirty = false;
    cloudRemote = null;
    data = newData();
    render();
}
function cloudStatusHTML() {
    if (cloudDirty)
        return `<span class="cloud-chip cloud-pending" title="Há alterações locais ainda não sincronizadas">${ic('info', 14)} Pendente</span>`;
    if (cloudSyncing)
        return `<span class="cloud-chip">${ic('repeat', 14)} Sincronizando</span>`;
    return `<span class="cloud-chip cloud-ok" title="Última versão salva na nuvem">${ic('check', 14)} Na nuvem</span>`;
}
async function cloudPush(snapshot, seq) {
    if (!cloudSession || cloudState === 'conflict')
        throw new Error('A sincronização está bloqueada.');
    cloudSyncing = true;
    try {
        const revision = await cloudApi('/rest/v1/rpc/save_financeflow_document', { method: 'POST', body: JSON.stringify({ p_payload: snapshot, p_expected_revision: cloudRevision }) });
        if (!Number.isSafeInteger(revision) || revision < 1)
            throw new Error('Resposta inesperada ao salvar.');
        cloudRevision = revision;
        if (seq === cloudSeq) {
            cloudDirty = false;
            cloudKeepCache(snapshot, false);
        }
    }
    catch (e) {
        if (e.message === 'SYNC_CONFLICT') {
            try {
                cloudRemote = await cloudLoadDoc();
            }
            catch { }
            cloudState = 'conflict';
            render();
        }
        throw e;
    }
    finally {
        cloudSyncing = false;
    }
}
async function cloudSave(snapshot) {
    cloudDirty = true;
    const seq = ++cloudSeq;
    cloudKeepCache(snapshot, true);
    const op = cloudQueue.then(() => cloudPush(snapshot, seq));
    cloudQueue = op.catch(() => { });
    return op;
}
async function cloudTrySync() {
    if (!cloudSession || cloudState !== 'ready' || cloudSyncing)
        return;
    if (!cloudDirty) {
        await cloudCheckRemote();
        return;
    }
    const remote = await cloudLoadDoc();
    if ((remote?.revision || 0) !== cloudRevision) {
        cloudRemote = remote || { payload: newData(), revision: 0 };
        cloudState = 'conflict';
        render();
        return;
    }
    try {
        await cloudSave(structuredClone(data));
        flash('Alterações sincronizadas.');
    }
    catch {
        render();
    }
}
async function cloudCheckRemote() {
    if (!cloudSession || cloudState !== 'ready' || cloudChecking || cloudSyncing || modal || document.activeElement?.closest('form'))
        return;
    cloudChecking = true;
    try {
        const remote = await cloudLoadDoc();
        if ((remote?.revision || 0) === cloudRevision)
            return;
        if (cloudDirty) {
            cloudRemote = remote || { payload: newData(), revision: 0 };
            cloudState = 'conflict';
            render();
            return;
        }
        data = remote?.payload || newData();
        cloudRevision = remote?.revision || 0;
        cloudKeepCache(data, false);
        render();
    }
    catch (e) {
        console.warn('Falha temporária ao consultar atualizações', e);
    }
    finally {
        cloudChecking = false;
    }
}
async function cloudLoadRemote() {
    if (!cloudRemote)
        return;
    if (!confirm('Descartar as alterações locais não sincronizadas e utilizar o conteúdo da nuvem? Baixe o backup local primeiro.'))
        return;
    data = cloudRemote.payload;
    cloudRevision = cloudRemote.revision;
    cloudDirty = false;
    cloudSeq++;
    cloudRemote = null;
    cloudState = 'ready';
    cloudKeepCache(data, false);
    page = 'dashboard';
    render();
}
function cloudInstallHooks() {
    window.addEventListener('online', () => { if (cloudState === 'ready')
        void cloudTrySync().catch(() => { }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && cloudState === 'ready')
        void (cloudDirty ? cloudTrySync() : cloudCheckRemote()).catch(() => { }); });
    setInterval(() => { if (!document.hidden && cloudState === 'ready')
        void (cloudDirty ? cloudTrySync() : cloudCheckRemote()).catch(() => { }); }, 15000);
}
/* FinanceFlow — Interface de gestão financeira integrada à nuvem privada. */
let data = newData();
let month = currentMonth();
let page = 'dashboard';
let modal = null;
let notice = null;
let filters = { period: 'month', category: '', min: '', max: '', search: '' };
let setupStep = 0;
let setupSalary = '';
let setupPercent = 20;
let setupFixed = [];
let sidebarOpen = false;
let busy = false;
let viewArchived = false;
const navItems = [['dashboard', 'Visão geral', 'layout-dashboard'], ['receitas', 'Minhas Receitas', 'wallet'], ['fixas', 'Despesas Fixas', 'calendar-clock'], ['gastos', 'Meus Gastos', 'credit-card'], ['economia', 'Economia Mensal', 'piggy-bank'], ['metas', 'Minhas Metas', 'target'], ['planejamento', 'Planejamento', 'calendar-days'], ['relatorios', 'Relatórios', 'chart-no-axes-combined'], ['configuracoes', 'Configurações', 'settings']];
const ICONS = {
    'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h15a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a3 3 0 0 1 0-6"/><path d="M17 14h.01"/>',
    'calendar-clock': '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><circle cx="16" cy="16" r="3"/><path d="M16 14.5V16l1 1"/>',
    'credit-card': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/>',
    'piggy-bank': '<path d="M19 5c-1.5-1-3.3-1.7-5-1.7-5.5 0-10 3.5-10 8 0 2.2 1 4.2 3 5.5V21h4v-2h5v2h4v-3c1.2-1.1 2-2.6 2-4v-3h-3V8l-1.5-1.5L19 5Z"/><path d="M11 6h3M16 12h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    'calendar-days': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    'chart-no-axes-combined': '<path d="M3 3v18h18M7 16l4-5 3 2 5-7"/><path d="M17 6h2v2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-1.8 1.8a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.5h-2.6V20a1.7 1.7 0 0 0-1.2-1.6 1.7 1.7 0 0 0-1.9.3l-1.8-1.8a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H5v-2.6h.5A1.7 1.7 0 0 0 7 10.2a1.7 1.7 0 0 0-.3-1.9l1.8-1.8a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h2.6v1.2A1.7 1.7 0 0 0 15 6.8a1.7 1.7 0 0 0 1.9-.3l1.8 1.8a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.5v2.6H20a1.7 1.7 0 0 0-.6 1.2Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', chevron: '<path d="m9 18 6-6-6-6"/>', chevronleft: '<path d="m15 18-6-6 6-6"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>', edit: '<path d="m16 4 4 4-11 11-5 1 1-5L16 4ZM14 6l4 4"/>', check: '<path d="m4 12 5 5L20 6"/>', close: '<path d="M18 6 6 18M6 6l12 12"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>', shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon: '<path d="M20 15a8 8 0 1 1-11-11 8 8 0 0 0 11 11Z"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', arrowup: '<path d="m12 19 0-14m-6 6 6-6 6 6"/>', arrowdown: '<path d="m12 5 0 14m-6-6 6 6 6-6"/>', repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>', info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 7h.01"/>', trend: '<path d="m3 17 7-7 4 4 7-7m-5 0h5v5"/>', file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', coins: '<circle cx="9" cy="8" r="5"/><path d="M16 9a5 5 0 1 1-7 7"/>', sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 18l.7 1.3L21 20l-1.3.7L19 22l-.7-1.3L17 20l1.3-.7L19 18Z"/>', empty: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M7 11h10M7 15h6"/>'
};
function ic(name, size = 19) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`; }
function buttons(type, label, variant = 'primary', other = '') { return `<button type="button" class="btn ${variant}" data-action="${type}" ${other}>${label}</button>`; }
function title(text, subtitle = '', action = '') { return `<div class="section-heading"><div><h2>${text}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</div>`; }
function emptyState(label, help, action = '') { return `<div class="empty">${ic('empty', 39)}<h3>${label}</h3><p>${help}</p>${action}</div>`; }
function pill(text, style = 'muted') { return `<span class="pill ${style}">${text}</span>`; }
function panel(content, cls = '') { return `<div class="panel ${cls}">${content}</div>`; }
function kpi(iconName, label, number, note = '', tone = '') { return `<div class="kpi"><div class="kpi-icon ${tone}">${ic(iconName, 19)}</div><span>${label}</span><strong title="${money(number)}">${money(number)}</strong><small>${note || 'Neste mês'}</small></div>`; }
function progress(current, total, color = 'green') { const v = total > 0 ? Math.max(0, Math.min(100, current / total * 100)) : 0; return `<div class="progress"><div class="progress-fill ${color}" style="width:${v}%"></div></div>`; }
function legendLabel(cat, n, i, total) { return `<div class="legend-row"><span class="legend-left"><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${escapeHtml(cat)}</span></span><span class="legend-num">${money(n)} <small>${total ? percent(n / total * 100) : '0%'}</small></span></div>`; }
function donut(rows) { const total = sum(rows, x => x.value); if (!total)
    return emptyState('Sem gastos para analisar', 'Registre suas despesas para gerar a distribuição.'); let offset = 0; const arcs = rows.map((r, i) => { const v = r.value / total * 100; const el = `<circle cx="100" cy="100" r="70" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="24" stroke-dasharray="${v} ${100 - v}" stroke-dashoffset="${-offset}" pathLength="100" transform="rotate(-90 100 100)"><title>${escapeHtml(r.name)}: ${money(r.value)} (${percent(v)})</title></circle>`; offset += v; return el; }).join(''); return `<div class="donut-layout"><div class="donut-wrap"><svg viewBox="0 0 200 200" role="img" aria-label="Gráfico de rosca por categoria"><circle cx="100" cy="100" r="70" fill="none" stroke="var(--border)" stroke-width="24"/>${arcs}<text x="100" y="95" text-anchor="middle" class="chart-inside-label">Total</text><text x="100" y="119" text-anchor="middle" class="chart-inside-number">${escapeHtml((total / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }))}</text></svg></div><div class="donut-legend">${rows.map((r, i) => legendLabel(r.name, r.value, i, total)).join('')}</div></div>`; }
function barChart(d, m) { const h = financeHistory(d, m, 6); const max = Math.max(1, ...h.map(x => Math.max(x.income, x.expenses))); return `<div class="bar-chart">${h.map(x => `<div class="bar-month"><div class="bar-group"><div class="bar income" style="height:${Math.max(0, x.income / max * 100)}%" title="${x.month}: receitas ${money(x.income)}"></div><div class="bar expense" style="height:${Math.max(0, x.expenses / max * 100)}%" title="${x.month}: despesas ${money(x.expenses)}"></div></div><small>${x.label}</small></div>`).join('')}</div><div class="chart-legend"><span><i class="dot income"></i>Receitas</span><span><i class="dot expense"></i>Despesas</span></div>`; }
function lineChart(d, m, field) { const h = financeHistory(d, m, 12); const values = h.map(x => x[field]); const lo = Math.min(0, ...values), hi = Math.max(1, ...values); const coords = values.map((v, i) => [30 + (i * 620 / (values.length - 1)), 25 + (hi - v) / (hi - lo) * 150]); const poly = coords.map(v => v.join(',')).join(' '); const zero = 25 + hi / (hi - lo) * 150; return `<svg class="line-chart" viewBox="0 0 680 228" role="img" aria-label="Evolução mensal de ${field === 'saved' ? 'economia real' : 'saldo'}"><line x1="30" y1="${zero}" x2="650" y2="${zero}" stroke="var(--border)" stroke-dasharray="5 4"/><polyline points="${poly}" stroke="${field === 'saved' ? '#0d9488' : '#2563eb'}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${coords.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.4" fill="${field === 'saved' ? '#0d9488' : '#2563eb'}"><title>${h[i].month}: ${money(values[i])}</title></circle>`).join('')}${h.map((x, i) => `<text x="${coords[i][0]}" y="211" text-anchor="middle" class="axis-label">${x.label}</text>`).join('')}</svg>`; }
function alertsHtml(a) { if (!a.length)
    return `<div class="alert-item success">${ic('check')}<span>Nenhum alerta para os registros deste mês.</span></div>`; return a.map(x => `<div class="alert-item ${x.level}">${ic(x.level === 'danger' ? 'info' : x.level === 'success' ? 'check' : 'bell')}<span>${escapeHtml(x.message)}</span></div>`).join(''); }
function dashboard() {
    const m = calc(data, month), cat = breakdown(data, month), warning = alerts(data, month), up = selectedFixed(data, month).filter(x => !x.paidMonths.includes(month)).sort((a, b) => a.dueDay - b.dueDay).slice(0, 4);
    return `<div class="hero"><div><div class="hero-eyebrow">SEU RESUMO FINANCEIRO</div><h2>Seu dinheiro, sob controle.</h2><p>Acompanhe suas decisões e mantenha seus objetivos à vista.</p></div><button class="btn white" data-action="open" data-kind="expense">${ic('plus', 17)} Registrar gasto</button><div class="hero-art">${ic('trend', 88)}</div></div>
 <div class="kpi-grid">${kpi('wallet', 'Receitas do mês', m.income, 'Fontes de renda', 'blue')}${kpi('calendar-clock', 'Despesas fixas', m.fixed, 'Contas recorrentes', 'violet')}${kpi('credit-card', 'Despesas variáveis', m.variable, 'Gastos pontuais', 'orange')}${kpi('arrowdown', 'Total de despesas', m.expenses, 'Fixas + variáveis', 'rose')}${kpi('target', 'Meta de economia', m.target, `${effectivePercent(data, month)}% da receita`, 'teal')}${kpi('coins', 'Saldo disponível', m.balance, 'Receitas menos despesas', 'blue')}${kpi('piggy-bank', 'Livre após a meta', m.afterTarget, 'Sem deduzir depósitos reais', 'green')}</div>
 <div class="commitment-banner"><div><span>RENDA COMPROMETIDA</span><strong>${percent(m.committed)}</strong><small>${money(m.expenses)} de ${money(m.income)} em despesas</small></div><div class="commitment-meter"><div style="width:${Math.min(100, m.committed)}%;background:${m.committed >= 100 ? '#ef596b' : m.committed >= 80 ? '#edac41' : '#22b6a2'}"></div></div><span class="commitment-info">${m.income === 0 ? 'Cadastre receitas para calcular o percentual' : m.committed > 100 ? 'As despesas superaram a renda' : m.committed >= 80 ? 'Atenção: orçamento pressionado' : 'Acompanhe o limite mensal'}</span></div>
 <div class="two-cols wide-left">${panel(`<div class="panel-title"><div><h3>Distribuição dos gastos</h3><p>Quanto cada categoria representa no mês</p></div>${ic('chart-no-axes-combined')}</div>${donut(cat)}`)}${panel(`<div class="panel-title"><div><h3>Sua economia mensal</h3><p>Depósitos líquidos registrados</p></div>${ic('piggy-bank')}</div><div class="saving-main">${money(m.saved)} <small>de ${money(m.target)}</small></div>${progress(m.saved, m.target)}<div class="saving-foot"><span>${percent(m.target ? m.saved / m.target * 100 : 0)} da meta</span><strong>${m.saved >= m.target ? 'Meta alcançada' : `Faltam ${money(m.target - m.saved)}`}</strong></div><button class="btn secondary full" data-action="open" data-kind="movement" data-goal="">${ic('plus', 16)} Registrar economia</button><div class="muted-note">A meta é um planejamento, não uma despesa. Transferências entre cofrinhos não contam como novos depósitos.</div>`)}</div>
 <div class="two-cols">${panel(`<div class="panel-title"><div><h3>Receitas x despesas</h3><p>Últimos 6 meses</p></div></div>${barChart(data, month)}`)}${panel(`<div class="panel-title"><div><h3>Alertas inteligentes</h3><p>Gerados a partir dos seus registros</p></div>${ic('bell')}</div><div class="alerts-list">${alertsHtml(warning)}</div>`)}</div>
 <div class="two-cols">${panel(`<div class="panel-title"><div><h3>Evolução do saldo</h3><p>Resultado de cada mês, sem acumular saldos</p></div></div>${lineChart(data, month, 'balance')}`)}${panel(`<div class="panel-title"><div><h3>Contas pendentes</h3><p>Despesas fixas do mês selecionado</p></div><button class="text-button" data-action="navigate" data-page="fixas">Ver todas ${ic('chevron', 14)}</button></div>${up.length ? up.map(f => `<div class="item-slim"><div class="item-icon">${ic('calendar-clock')}</div><div><strong>${escapeHtml(f.description)}</strong><small>Vence dia ${f.dueDay}</small></div><b>${money(f.amount)}</b></div>`).join('') : emptyState('Tudo em dia', 'Nenhuma conta fixa pendente neste mês.')}`)}</div>${panel(`<div class="panel-title"><div><h3>Histórico de economia mensal</h3><p>Depósitos líquidos dos últimos 12 meses</p></div></div>${lineChart(data, month, 'saved')}`)}`;
}
function actionBar(kind, label) { return `<button class="btn primary" data-action="open" data-kind="${kind}">${ic('plus', 17)} ${label}</button>`; }
function incomeView() { const list = selectedIncomes(data, month), m = calc(data, month); return `${title('Minhas Receitas', 'Salários, trabalhos e outras fontes de renda.', actionBar('income', 'Nova receita'))}<div class="small-stats">${kpi('wallet', 'Receitas do mês', m.income, 'Registradas', 'blue')}${kpi('repeat', 'Receitas recorrentes', sum(list.filter(x => x.recurring), x => x.amount), 'Incluídas no mês', 'teal')}${kpi('coins', 'Receitas pontuais', sum(list.filter(x => !x.recurring), x => x.amount), 'Incluídas no mês', 'orange')}</div>${panel(list.length ? `<div class="table-scroll"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Recebimento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${list.map(x => `<tr><td><strong>${escapeHtml(x.description)}</strong><small>${escapeHtml(x.kind)}</small></td><td>${pill(x.recurring ? 'Recorrente' : 'Pontual', x.recurring ? 'info' : 'muted')}</td><td>${x.recurring ? `Todo dia ${Number(x.date.slice(8))}` : displayDate(x.date)}</td><td class="money-cell">${money(x.amount)}</td><td class="actions">${smallAction('edit', 'income', x.id)}${smallAction('delete', 'income', x.id)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma receita neste mês', 'Cadastre seu salário ou outra fonte de renda.', actionBar('income', 'Adicionar receita')))}`; }
function smallAction(a, kind, id) { return `<button class="icon-btn" aria-label="${a === 'edit' ? 'Editar' : 'Excluir'}" title="${a === 'edit' ? 'Editar' : 'Excluir'}" data-action="${a}" data-kind="${kind}" data-id="${escapeHtml(id)}">${ic(a === 'edit' ? 'edit' : 'trash', 16)}</button>`; }
function displayDate(date) { if (!date)
    return '—'; const [y, m, d] = date.split('-'); return `${d}/${m}/${y}`; }
function fixedView() { const list = selectedFixed(data, month), v = calc(data, month); const paid = list.filter(x => x.paidMonths.includes(month)); return `${title('Despesas Fixas', 'Contas que se repetem automaticamente a cada mês.', actionBar('fixed', 'Nova despesa fixa'))}<div class="small-stats">${kpi('calendar-clock', 'Total comprometido', v.fixed, 'Todas as contas', 'violet')}${kpi('check', 'Total pago', sum(paid, x => x.amount), `${paid.length} conta(s) paga(s)`, 'green')}${kpi('bell', 'Total pendente', sum(list.filter(x => !x.paidMonths.includes(month)), x => x.amount), 'A vencer / em aberto', 'orange')}</div>${panel(list.length ? `<div class="table-scroll"><table><thead><tr><th>Conta / categoria</th><th>Vencimento</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${list.map(x => `<tr><td><strong>${escapeHtml(x.description)}</strong><small>${escapeHtml(x.category)}</small></td><td>Dia ${x.dueDay}</td><td><button class="status-toggle ${x.paidMonths.includes(month) ? 'paid' : 'pending'}" data-action="paid" data-id="${escapeHtml(x.id)}">${ic(x.paidMonths.includes(month) ? 'check' : 'bell', 14)} ${x.paidMonths.includes(month) ? 'Paga' : 'Pendente'}</button></td><td class="money-cell">${money(x.amount)}</td><td class="actions">${smallAction('edit', 'fixed', x.id)}${smallAction('delete', 'fixed', x.id)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma conta fixa', 'As contas cadastradas se repetirão nos próximos meses.', actionBar('fixed', 'Cadastrar conta')))}<p class="inside-tip">${ic('info', 16)} Alterar ou excluir uma conta recorrente afeta apenas o mês selecionado e os próximos meses da mesma versão. O histórico permanece preservado.</p>`; }
function filteredExpenses() { const end = month; let start = end; if (filters.period === 'quarter')
    start = addMonth(end, -2); if (filters.period === 'year')
    start = addMonth(end, -11); return data.expenses.filter(x => (filters.period === 'all' || (monthOf(x.date) >= start && monthOf(x.date) <= end)) && (!filters.category || x.category === filters.category) && (!filters.search || x.description.toLowerCase().includes(filters.search.toLowerCase())) && (!filters.min || x.amount >= amountToCents(filters.min)) && (!filters.max || x.amount <= amountToCents(filters.max))).sort((a, b) => b.date.localeCompare(a.date)); }
function expenseView() { const list = filteredExpenses(), total = sum(list, x => x.amount), catMap = new Map(); for (const x of list)
    catMap.set(x.category, (catMap.get(x.category) || 0) + x.amount); const cat = Array.from(catMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); return `${title('Meus Gastos', 'Registre e filtre suas despesas do dia a dia.', actionBar('expense', 'Novo gasto'))}<div class="filterbar"><label>Período<select data-filter="period"><option value="month" ${filters.period === 'month' ? 'selected' : ''}>Mês selecionado</option><option value="quarter" ${filters.period === 'quarter' ? 'selected' : ''}>Últimos 3 meses</option><option value="year" ${filters.period === 'year' ? 'selected' : ''}>Últimos 12 meses</option><option value="all" ${filters.period === 'all' ? 'selected' : ''}>Todos os registros</option></select></label><label>Categoria<select data-filter="category"><option value="">Todas</option>${CATEGORIES.map(c => `<option ${filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>Mínimo (R$)<input type="number" min="0" step="0.01" placeholder="0,00" value="${escapeHtml(filters.min)}" data-filter="min"></label><label>Máximo (R$)<input type="number" min="0" step="0.01" placeholder="Sem limite" value="${escapeHtml(filters.max)}" data-filter="max"></label><label class="search-filter">Buscar<input placeholder="Descrição..." value="${escapeHtml(filters.search)}" data-filter="search"></label><button class="btn ghost filter-clear" data-action="clear-filter">Limpar</button></div><div class="small-stats stats-two">${kpi('credit-card', 'Gasto filtrado', total, `${list.length} lançamento(s)`, 'orange')}${kpi('chart-no-axes-combined', 'Maior categoria', cat.length ? cat[0].value : 0, cat.length ? cat[0].name : 'Sem gastos', 'blue')}</div><div class="two-cols wide-left">${panel(`<div class="panel-title"><div><h3>Lançamentos</h3><p>${list.length} resultado(s)</p></div></div>${list.length ? `<div class="table-scroll"><table><thead><tr><th>Descrição</th><th>Data</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${list.map(x => `<tr><td><strong>${escapeHtml(x.description)}</strong><small>${escapeHtml(x.category)}</small></td><td>${displayDate(x.date)}</td><td class="money-cell">${money(x.amount)}</td><td class="actions">${smallAction('edit', 'expense', x.id)}${smallAction('delete', 'expense', x.id)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhum gasto encontrado', 'Registre despesas ou ajuste os filtros.')}`)}${panel(`<div class="panel-title"><div><h3>Por categoria</h3><p>De acordo com o filtro aplicado</p></div></div>${donut(cat)}`)}</div>`; }
function economyView() {
    const m = calc(data, month);
    const list = selectedMovements(data, month).slice().sort((a, b) => b.date.localeCompare(a.date));
    const goalName = (id) => id ? data.goals.find(x => x.id === id)?.name || 'Meta removida' : 'Cofrinho geral';
    return `${title('Economia Mensal', 'Seu planejamento e os valores efetivamente guardados.', buttons('open', `${ic('plus', 17)} Nova movimentação`, 'primary', 'data-kind="movement"'))}<div class="saving-focus">${panel(`<div class="panel-title"><div><h3>Porcentagem destinada à economia</h3><p>A meta é recalculada automaticamente pela renda mensal.</p></div>${ic('target')}</div><div class="range-header"><strong id="pctLabel">${effectivePercent(data, month)}%</strong><small>da sua receita</small></div><input type="range" id="saving-range" min="0" max="100" step="1" value="${effectivePercent(data, month)}" aria-label="Porcentagem de economia"><div class="range-labels"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div><div class="economy-values"><div><span>Meta calculada</span><strong id="targetPreview">${money(m.target)}</strong></div><div><span>Limite para despesas</span><strong id="spendPreview">${money(m.availableToSpend)}</strong></div></div>`)}${panel(`<div class="panel-title"><div><h3>Progresso real</h3><p>Depósitos menos retiradas no mês</p></div></div><div class="saving-main">${money(m.saved)} <small>/ ${money(m.target)}</small></div>${progress(m.saved, m.target)}<div class="economy-values"><div><span>Ainda falta</span><strong>${money(Math.max(0, m.target - m.saved))}</strong></div><div><span>Saldo livre após a meta</span><strong class="${m.afterTarget < 0 ? 'negative' : ''}">${money(m.afterTarget)}</strong></div></div><p class="muted-note">Economia planejada e economia realizada são indicadores distintos. Uma transferência entre cofrinhos não aumenta a economia total.</p>`)}</div>
 ${panel(`<div class="panel-title"><div><h3>Histórico de movimentações</h3><p>Operações registradas em ${monthLabel(month)}</p></div></div>${list.length ? `<div class="table-scroll"><table><thead><tr><th>Operação</th><th>Data</th><th>Destino / origem</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${list.map(x => `<tr><td><strong>${x.kind === 'deposit' ? 'Depósito' : x.kind === 'withdraw' ? 'Retirada' : 'Transferência'}</strong><small>${escapeHtml(x.note || 'Sem observação')}</small></td><td>${displayDate(x.date)}</td><td>${escapeHtml(x.kind === 'deposit' ? goalName(x.toGoal) : x.kind === 'withdraw' ? goalName(x.fromGoal) : `${goalName(x.fromGoal)} → ${goalName(x.toGoal)}`)}</td><td class="money-cell ${x.kind === 'withdraw' ? 'negative' : ''}">${x.kind === 'withdraw' ? '-' : ''}${money(x.amount)}</td><td class="actions">${smallAction('delete', 'movement', x.id)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma economia registrada', 'Registre depósitos ou retiradas para acompanhar a meta mensal.')}`)}`;
}
function goalsView() { const goals = data.goals.filter(x => viewArchived || !x.archived); const totalSaved = sum(data.goals, x => goalBalance(data, x.id)); const pooled = goalBalance(data, null); return `${title('Minhas Metas', 'Transforme suas economias em objetivos concretos.', actionBar('goal', 'Nova meta'))}<div class="small-stats stats-two">${kpi('target', 'Patrimônio nos objetivos', totalSaved, 'Soma dos cofrinhos', 'green')}${kpi('piggy-bank', 'Cofrinho geral', pooled, 'Sem objetivo específico', 'teal')}</div><div class="goal-list">${goals.map(g => { const b = goalBalance(data, g.id); const done = b >= g.target; return `<div class="panel goal-card ${g.archived ? 'archived' : ''}"><div class="goal-top"><div class="goal-icon">${ic('target', 24)}</div><div class="goal-actions">${smallAction('edit', 'goal', g.id)}<button class="icon-btn" data-action="archive" data-id="${escapeHtml(g.id)}" title="${g.archived ? 'Reativar' : 'Arquivar ou excluir'}">${ic(g.archived ? 'repeat' : 'trash', 16)}</button></div></div><h3>${escapeHtml(g.name)} ${g.archived ? pill('Arquivada') : ''}</h3>${g.dueDate ? `<small>Prazo: ${displayDate(g.dueDate)}</small>` : '<small>Sem prazo definido</small>'}<div class="goal-numbers"><strong>${money(b)}</strong><span>de ${money(g.target)}</span></div>${progress(b, g.target)}<div class="goal-foot"><span>${percent(b / g.target * 100)} alcançado</span>${done ? pill('Concluída', 'paid') : ''}</div><button class="btn secondary full" data-action="open" data-kind="movement" data-goal="${escapeHtml(g.id)}" ${g.archived ? 'disabled' : ''}>${ic('plus', 16)} Movimentar saldo</button></div>`; }).join('')}${!goals.length ? panel(emptyState('Nenhuma meta cadastrada', 'Defina um objetivo e acompanhe sua evolução.', actionBar('goal', 'Criar primeira meta'))) : ''}</div><div class="goal-bottom"><button class="btn ghost" data-action="toggle-archive">${viewArchived ? 'Ocultar' : 'Mostrar'} metas arquivadas</button>${buttons('open', `${ic('repeat', 16)} Transferir entre cofrinhos`, 'secondary', 'data-kind="transfer"')}</div><p class="inside-tip">${ic('info', 16)} O valor inicial de uma meta é um saldo anterior, não um depósito do mês atual. Depósitos novos entram no histórico de economia; transferências apenas redistribuem saldos.</p>`; }
function planView() { const m = calc(data, month), p = calc(data, addMonth(month, -1)), row = (label, a, b) => `<tr><td>${label}</td><td class="money-cell">${money(a)}</td><td class="money-cell">${money(b)}</td><td>${a === b ? pill('Sem alteração') : pill(`${a > b ? '+' : ''}${money(a - b)}`, a > b ? 'info' : 'paid')}</td></tr>`; return `${title('Planejamento Mensal', 'Compare competências sem perder o histórico.')}${panel(`<div class="panel-title"><div><h3>Resumo de ${monthLabel(month)}</h3><p>Meta e saldo do próprio mês</p></div></div><div class="plan-grid">${kpi('wallet', 'Receitas', m.income)}${kpi('calendar-clock', 'Fixas', m.fixed)}${kpi('credit-card', 'Variáveis', m.variable)}${kpi('piggy-bank', 'Economia real', m.saved)}${kpi('target', 'Meta de economia', m.target)}${kpi('coins', 'Saldo final do mês', m.balance)}</div><div class="summary-stripe"><span>Disponível após meta de economia</span><strong class="${m.afterTarget < 0 ? 'negative' : ''}">${money(m.afterTarget)}</strong></div>`)}${panel(`<div class="panel-title"><div><h3>Comparação com o mês anterior</h3><p>${monthLabel(month)} x ${monthLabel(addMonth(month, -1))}</p></div></div><div class="table-scroll"><table><thead><tr><th>Indicador</th><th>Mês atual</th><th>Mês anterior</th><th>Diferença</th></tr></thead><tbody>${row('Receitas', m.income, p.income)}${row('Fixas', m.fixed, p.fixed)}${row('Variáveis', m.variable, p.variable)}${row('Despesas totais', m.expenses, p.expenses)}${row('Economia real', m.saved, p.saved)}${row('Saldo do mês', m.balance, p.balance)}</tbody></table></div>`)}`; }
function reportView() { const m = calc(data, month), cats = breakdown(data, month), h = financeHistory(data, month, 12); return `${title('Relatórios Financeiros', 'Análises baseadas apenas em registros do FinanceFlow.', buttons('export-csv', `${ic('download', 16)} Exportar CSV`))}<div class="small-stats">${kpi('wallet', 'Receitas', m.income)}${kpi('credit-card', 'Despesas', m.expenses)}${kpi('piggy-bank', 'Economia efetiva', m.saved)}</div><div class="two-cols">${panel(`<div class="panel-title"><div><h3>Receitas e despesas</h3><p>Últimas 6 competências</p></div></div>${barChart(data, month)}`)}${panel(`<div class="panel-title"><div><h3>Distribuição percentual</h3><p>Por categoria de despesa</p></div></div>${donut(cats)}`)}</div><div class="two-cols">${panel(`<div class="panel-title"><div><h3>Evolução do saldo</h3><p>Últimos 12 meses</p></div></div>${lineChart(data, month, 'balance')}`)}${panel(`<div class="panel-title"><div><h3>Histórico de economia</h3><p>Depósitos líquidos em cada mês</p></div></div>${lineChart(data, month, 'saved')}`)}</div>${panel(`<div class="panel-title"><div><h3>Histórico mensal</h3><p>Valores em reais, por competência</p></div></div><div class="table-scroll"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Fixas</th><th>Variáveis</th><th>Economia real</th><th>Saldo</th></tr></thead><tbody>${h.slice().reverse().map(x => `<tr><td><strong>${monthLabel(x.month)}</strong></td><td>${money(x.income)}</td><td>${money(x.fixed)}</td><td>${money(x.variable)}</td><td>${money(x.saved)}</td><td class="money-cell">${money(x.balance)}</td></tr>`).join('')}</tbody></table></div>`)}`; }
function settingsView() { return `${title('Configurações', 'Sua conta, sincronização, backup e privacidade.')}${panel(`<div class="setting-title">${ic('shield', 23)}<div><h3>Seus dados estão protegidos por conta</h3><p>Conectado como <strong>${escapeHtml(cloudSession?.user.email || 'usuário')}</strong>. Os registros são armazenados no Supabase e são acessíveis apenas com sua autenticação. As permissões de banco são verificadas por RLS.</p></div></div><div class="settings-actions">${cloudStatusHTML()}<button class="btn secondary" data-action="cloud-retry-sync">${ic('repeat', 17)} Verificar sincronização</button><button class="btn danger" data-action="cloud-logout">Sair da conta</button></div><p class="inside-tip">Sincronização automática a cada 15 segundos com a página aberta e ao voltar ao aplicativo. É necessária conexão com a internet. Continue fazendo backups regulares.</p>`)}${panel(`<div class="setting-title">${ic('download', 23)}<div><h3>Backup e restauração</h3><p>Exporte os seus registros e importe backups da versão anterior do FinanceFlow.</p></div></div><div class="settings-actions"><button class="btn primary" data-action="export-json">${ic('download', 17)} Fazer backup JSON</button><button class="btn secondary" data-action="import-json">${ic('upload', 17)} Restaurar backup</button><input type="file" id="backupFile" accept=".json,application/json" hidden></div><p class="inside-tip">Importar um arquivo substitui os dados da conta após confirmação. Recomenda-se exportar o backup atual antes.</p>`)}${panel(`<div class="setting-title">${ic('moon', 23)}<div><h3>Aparência</h3><p>Escolha o modo de visualização.</p></div></div><div class="settings-actions"><button class="btn secondary" data-action="theme" data-theme="light">${ic('sun', 18)} Claro</button><button class="btn secondary" data-action="theme" data-theme="dark">${ic('moon', 18)} Escuro</button><button class="btn secondary" data-action="theme" data-theme="system">${ic('settings', 18)} Sistema</button></div>`)}${panel(`<div class="setting-title">${ic('file', 23)}<div><h3>Exportação de relatórios</h3><p>CSV organizado por lançamentos e competência.</p></div></div><div class="settings-actions"><button class="btn secondary" data-action="export-csv">${ic('download', 17)} Baixar CSV de ${monthLabel(month)}</button></div>`)}${panel(`<div class="setting-title">${ic('trash', 23)}<div><h3>Redefinir os registros da conta</h3><p>Apaga os dados financeiros da nuvem e de seus dispositivos sincronizados, mas não exclui sua conta. A recuperação exige backup.</p></div></div><button class="btn danger" data-action="reset">${ic('trash', 16)} Excluir todos os registros</button>`)}<div class="settings-footer">FinanceFlow Cloud • Uso pessoal • Sem integração bancária automática</div>`; }
function pageContent() { switch (page) {
    case 'dashboard': return dashboard();
    case 'receitas': return incomeView();
    case 'fixas': return fixedView();
    case 'gastos': return expenseView();
    case 'economia': return economyView();
    case 'metas': return goalsView();
    case 'planejamento': return planView();
    case 'relatorios': return reportView();
    case 'configuracoes': return settingsView();
} }
function input(name, label, type = 'text', value = '', extra = '') { return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`; }
function selectInput(name, label, opts, chosen = '') { return `<label class="field"><span>${label}</span><select name="${name}">${opts.map(o => `<option value="${escapeHtml(o.value)}" ${o.value === chosen ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></label>`; }
function categoryOptions(chosen = 'Outros') { return selectInput('category', 'Categoria', CATEGORIES.map(c => ({ value: c, label: c })), chosen); }
function goalOptions() { return [{ value: '', label: 'Cofrinho geral' }, ...data.goals.filter(g => !g.archived).map(g => ({ value: g.id, label: g.name }))]; }
function modalContent() {
    if (!modal)
        return '';
    const type = modal.type, id = modal.id;
    let head = '', help = '', body = '';
    const edit = !!id;
    const today = month === currentMonth() ? isoLocal(now()) : `${month}-01`;
    if (type === 'income') {
        const x = data.incomes.find(v => v.id === id);
        head = edit ? 'Editar receita' : 'Adicionar receita';
        help = x?.recurring ? 'Alterações em receitas recorrentes passam a valer a partir do mês selecionado.' : 'Cadastre sua fonte de renda.';
        body = `<div class="form-grid">${input('description', 'Descrição', 'text', x?.description || '', 'required maxlength="160" placeholder="Ex.: Salário principal"')}${input('amount', 'Valor (R$)', 'number', x ? x.amount / 100 : '', 'required min="0.01" max="10000000000" step="0.01"')}${selectInput('kind', 'Tipo de receita', ['Salário', 'Renda extra', 'Freelance', 'Outras receitas'].map(v => ({ value: v, label: v })), x?.kind || 'Salário')}${input('date', 'Data do recebimento', 'date', x?.recurring && x.startMonth < month ? `${month}-${x.date.slice(8)}` : x?.date || today, 'required')}</div><label class="check-row"><input name="recurring" type="checkbox" ${x?.recurring || !edit ? 'checked' : ''}><span>Repetir mensalmente, a partir da data informada</span></label>`;
    }
    else if (type === 'fixed') {
        const x = data.fixed.find(v => v.id === id);
        head = edit ? 'Editar despesa fixa' : 'Cadastrar despesa fixa';
        help = 'Os lançamentos são gerados automaticamente na visualização de cada mês, sem duplicar registros.';
        body = `<div class="form-grid">${input('description', 'Nome da conta', 'text', x?.description || '', 'required maxlength="160" placeholder="Ex.: Internet"')}${input('amount', 'Valor mensal (R$)', 'number', x ? x.amount / 100 : '', 'required min="0.01" step="0.01"')}${categoryOptions(x?.category || 'Contas')}${input('dueDay', 'Dia do vencimento', 'number', x?.dueDay || 10, 'required min="1" max="31" step="1"')}</div><p class="modal-help">Se o dia não existir em determinado mês, o vencimento será considerado no último dia desse mês. ${edit ? 'Histórico anterior permanece intacto.' : ''}</p>`;
    }
    else if (type === 'expense') {
        const x = data.expenses.find(v => v.id === id);
        head = edit ? 'Editar gasto' : 'Registrar gasto';
        help = 'Informe um gasto realizado. A data define em qual competência ele aparece.';
        body = `<div class="form-grid">${input('description', 'Descrição', 'text', x?.description || '', 'required maxlength="160" placeholder="Ex.: Supermercado"')}${input('amount', 'Valor (R$)', 'number', x ? x.amount / 100 : '', 'required min="0.01" step="0.01"')}${categoryOptions(x?.category || 'Alimentação')}${input('date', 'Data do gasto', 'date', x?.date || today, 'required')}</div>`;
    }
    else if (type === 'goal') {
        const x = data.goals.find(v => v.id === id);
        head = edit ? 'Editar objetivo' : 'Criar objetivo';
        help = 'Organize o dinheiro guardado por finalidade, sem contar movimentações duas vezes.';
        body = `<div class="form-grid">${input('name', 'Nome do objetivo', 'text', x?.name || '', 'required maxlength="160" placeholder="Ex.: Reserva de emergência"')}${input('target', 'Valor desejado (R$)', 'number', x ? x.target / 100 : '', 'required min="0.01" step="0.01"')}${input('initial', 'Valor já acumulado (R$)', 'number', x ? x.initial / 100 : 0, `min="0" step="0.01" ${edit && data.movements.some(m => m.fromGoal === id || m.toGoal === id) ? 'readonly' : ''}`)}${input('dueDate', 'Prazo (opcional)', 'date', x?.dueDate || '', '')}</div>${edit && data.movements.some(m => m.fromGoal === id || m.toGoal === id) ? '<p class="modal-help">O saldo inicial está bloqueado após a primeira movimentação, para preservar o histórico. Utilize depósitos e retiradas.</p>' : '<p class="modal-help">O saldo inicial é patrimônio anterior; ele não entra na economia deste mês.</p>'}`;
    }
    else if (type === 'movement') {
        head = 'Movimentar economia';
        help = 'Depósitos aumentam a economia do mês; retiradas reduzem. Não são despesas variáveis.';
        const chosen = modal.goal || '';
        body = `<div class="form-grid">${selectInput('kind', 'Tipo de movimentação', [{ value: 'deposit', label: 'Depósito / guardar dinheiro' }, { value: 'withdraw', label: 'Retirada / usar dinheiro guardado' }])}${input('amount', 'Valor (R$)', 'number', '', 'required min="0.01" step="0.01"')}${selectInput('account', 'Cofrinho / objetivo', goalOptions(), chosen)}${input('date', 'Data', 'date', today, 'required')}</div>${input('note', 'Observação (opcional)', 'text', '', 'maxlength="500" placeholder="Ex.: Economia do salário"')}<p class="modal-help">Saldo disponível no cofrinho selecionado: <strong>${money(goalBalance(data, chosen || null))}</strong>. Retiradas não podem ultrapassar o saldo.</p>`;
    }
    else if (type === 'transfer') {
        head = 'Transferir entre cofrinhos';
        help = 'Uma transferência não é renda nem economia nova.';
        body = `<div class="form-grid">${selectInput('from', 'Cofrinho de origem', goalOptions())}${selectInput('to', 'Cofrinho de destino', goalOptions(), data.goals.find(g => !g.archived)?.id || '')}${input('amount', 'Valor (R$)', 'number', '', 'required min="0.01" step="0.01"')}${input('date', 'Data', 'date', today, 'required')}</div>${input('note', 'Observação (opcional)', 'text', '', 'maxlength="500"')}`;
    }
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(head)}"><div class="modal-head"><div><h2>${escapeHtml(head)}</h2><p>${escapeHtml(help)}</p></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">${ic('close')}</button></div><form id="entity-form" data-kind="${type}" data-id="${escapeHtml(id || '')}"><div class="modal-body">${body}</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button type="submit" class="btn primary">${edit ? 'Salvar alterações' : 'Confirmar'}</button></div></form></div></div>`;
}
function onboarding() {
    const stepTitles = ['Sua renda', 'Contas fixas', 'Sua economia', 'Tudo pronto'];
    let main = '';
    if (setupStep === 0)
        main = `<form id="onboard-form"><div class="onboard-icon">${ic('wallet', 30)}</div><h1>Comece pelo que você ganha.</h1><p>Informe seu salário mensal. Você poderá adicionar outras receitas depois.</p>${input('salary', 'Salário mensal (R$)', 'number', setupSalary, 'required min="0.01" step="0.01" placeholder="3000,00"')}<button type="submit" class="btn primary full">Continuar ${ic('chevron', 18)}</button></form>`;
    if (setupStep === 1)
        main = `<form id="onboard-form"><div class="onboard-icon">${ic('calendar-clock', 29)}</div><h1>Quais são suas contas fixas?</h1><p>Inclua as principais despesas recorrentes. Este passo é opcional.</p><div id="setup-fixed-list">${setupFixed.map((x, i) => `<div class="setup-row"><input name="fd-${i}" placeholder="Ex.: Internet" maxlength="160" value="${escapeHtml(x.description)}" aria-label="Nome da conta"><input name="fa-${i}" type="number" min="0" step="0.01" placeholder="R$" value="${escapeHtml(x.amount)}" aria-label="Valor"><select name="fc-${i}" aria-label="Categoria">${CATEGORIES.map(c => `<option ${c === x.category ? 'selected' : ''}>${c}</option>`).join('')}</select><input name="fv-${i}" type="number" min="1" max="31" value="${escapeHtml(x.dueDay)}" aria-label="Vencimento" title="Dia do mês"><button type="button" class="icon-btn" data-action="setup-remove" data-index="${i}" aria-label="Remover conta">${ic('close', 16)}</button></div>`).join('')}</div><button type="button" class="btn ghost full" data-action="setup-add">${ic('plus', 16)} Adicionar conta</button><div class="onboard-actions"><button type="button" class="btn secondary" data-action="setup-back">Voltar</button><button type="submit" class="btn primary">Continuar ${ic('chevron', 16)}</button></div></form>`;
    if (setupStep === 2)
        main = `<form id="onboard-form"><div class="onboard-icon">${ic('piggy-bank', 30)}</div><h1>Quanto deseja economizar?</h1><p>Defina uma porcentagem do salário mensal para planejar seu futuro.</p><div class="range-header"><strong id="setupPct">${setupPercent}%</strong><small>do salário</small></div><input type="range" id="setupRange" name="pct" min="0" max="100" step="1" value="${setupPercent}"><div class="range-labels"><span>0%</span><span>50%</span><span>100%</span></div><div class="onboard-calculation"><span>Sua meta mensal</span><strong id="setupMoney">${money(Math.round(amountToCents(setupSalary || '0') * setupPercent / 100))}</strong></div><div class="onboard-actions"><button type="button" class="btn secondary" data-action="setup-back">Voltar</button><button type="submit" class="btn primary">Continuar ${ic('chevron', 16)}</button></div></form>`;
    if (setupStep === 3)
        main = `<div class="onboard-last"><div class="onboard-icon">${ic('check', 33)}</div><h1>Seu FinanceFlow está pronto.</h1><p>Confira o planejamento inicial e comece a controlar seu dinheiro.</p><div class="onboard-check"><span>Salário mensal</span><strong>${money(amountToCents(setupSalary))}</strong></div><div class="onboard-check"><span>Contas cadastradas</span><strong>${setupFixed.length}</strong></div><div class="onboard-check"><span>Meta de economia</span><strong>${setupPercent}% (${money(Math.round(amountToCents(setupSalary) * setupPercent / 100))})</strong></div><button class="btn primary full" data-action="setup-finish">Acessar meu dashboard ${ic('chevron', 18)}</button><button class="btn ghost full" data-action="setup-back">Revisar</button></div>`;
    return `<div class="onboarding-shell"><div class="onboarding-brand"><div class="brand-mark">${ic('chart-no-axes-combined', 23)}</div><strong>Finance<span>Flow</span></strong></div><div class="onboarding-card"><div class="onboard-step-title">CONFIGURAÇÃO INICIAL <span>${setupStep + 1} DE 4</span></div><div class="step-track">${stepTitles.map((x, i) => `<span class="${i <= setupStep ? 'active' : ''}"></span>`).join('')}</div>${main}</div><p class="onboard-foot">${ic('lock', 15)} Dados financeiros sincronizados na sua conta com acesso protegido.</p></div>`;
}
function applyTheme(t) { if (!['light', 'dark', 'system'].includes(t))
    t = 'system'; try {
    localStorage.setItem('financeflow-theme', t);
}
catch { } document.documentElement.setAttribute('data-theme', t); }
function mainShell() { const selected = navItems.find(v => v[0] === page); return `<div class="app-layout"><div class="mobile-overlay ${sidebarOpen ? 'visible' : ''}" data-action="close-sidebar"></div><aside class="sidebar ${sidebarOpen ? 'open' : ''}"><div class="brand"><div class="brand-mark">${ic('chart-no-axes-combined', 22)}</div><strong>Finance<span>Flow</span></strong><button class="icon-btn sidebar-close" data-action="close-sidebar" aria-label="Fechar menu">${ic('close')}</button></div><div class="sidebar-caption">MENU PRINCIPAL</div><nav class="side-nav">${navItems.map(([key, label, icon]) => `<button class="side-item ${page === key ? 'selected' : ''}" data-action="navigate" data-page="${key}">${ic(icon, 19)}<span>${label}</span>${page === key ? '<i></i>' : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-private">${ic('shield', 20)}<div><strong>Conta protegida</strong><small>${escapeHtml(cloudSession?.user.email || 'Sua conta')}</small></div></div><small>FinanceFlow • Cloud 1.0</small></div></aside><main class="main"><header class="topbar"><div class="topbar-left"><button class="icon-btn mobile-menu" data-action="open-sidebar" aria-label="Abrir menu">${ic('menu', 21)}</button><div><div class="breadcrumb">FinanceFlow <span> / </span> ${escapeHtml(selected?.[1] || '')}</div><h1>${escapeHtml(selected?.[1] || 'Visão geral')}</h1></div></div><div class="topbar-right">${cloudStatusHTML()}<div class="month-switch"><button class="month-btn" data-action="prev-month" aria-label="Mês anterior">${ic('chevronleft', 17)}</button><strong>${monthLabel(month)}</strong><button class="month-btn" data-action="next-month" aria-label="Próximo mês">${ic('chevron', 17)}</button></div>${month !== currentMonth() ? `<button class="btn today" data-action="today">Hoje</button>` : ''}<button class="icon-btn top-theme" data-action="toggle-theme" aria-label="Alternar tema">${ic('moon', 20)}</button></div></header><div class="page-body">${pageContent()}<footer class="page-footer">FinanceFlow Cloud • Dados sincronizados com sua conta • ${monthLabel(month)}</footer></div></main><nav class="mobile-bottom" aria-label="Navegação rápida">${[['dashboard', 'Início', 'layout-dashboard'], ['gastos', 'Gastos', 'credit-card'], ['fixas', 'Fixas', 'calendar-clock'], ['economia', 'Economia', 'piggy-bank']].map(([k, l, i]) => `<button class="${page === k ? 'selected' : ''}" data-action="navigate" data-page="${k}">${ic(i, 22)}<span>${l}</span></button>`).join('')}<button data-action="open-sidebar">${ic('menu', 22)}<span>Mais</span></button></nav></div>`; }
function render() { const app = document.getElementById('app'); if (!app)
    return; app.innerHTML = cloudState !== 'ready' ? cloudAuthHTML() : data.setup ? mainShell() + modalContent() : onboarding(); if (notice) {
    const n = document.createElement('div');
    n.className = `toast ${notice.type}`;
    n.innerHTML = `${ic(notice.type === 'success' ? 'check' : 'info', 18)}<span>${escapeHtml(notice.message)}</span><button class="icon-btn" data-action="dismiss-toast" aria-label="Fechar">${ic('close', 14)}</button>`;
    app.appendChild(n);
} document.title = `FinanceFlow | ${data.setup ? (navItems.find(n => n[0] === page)?.[1] || 'Início') : 'Configuração inicial'}`; }
function flash(message, type = 'success') { notice = { message, type }; render(); setTimeout(() => { if (notice?.message === message) {
    notice = null;
    const t = document.querySelector('.toast');
    t?.remove();
} }, 4500); }
async function save(success) {
    try {
        validateData(data);
        // Não declarar sucesso na nuvem antes que o servidor confirme a gravação.
        await cloudSave(structuredClone(data));
        if (success)
            flash(success);
        else
            render();
    }
    catch (e) {
        if (cloudState === 'conflict')
            return;
        flash('Alteração guardada temporariamente neste dispositivo, mas NÃO sincronizada. Verifique sua conexão em Configurações.', 'error');
    }
}
function safeDate(s) { if (!/^\d{4}-\d\d-\d\d$/.test(s) || Number.isNaN(Date.parse(`${s}T12:00:00`)) || isoLocal(new Date(`${s}T12:00:00`)) !== s)
    throw new Error('Selecione uma data válida.'); return s; }
function formString(f, k) { return String(f.get(k) || '').trim(); }
function readFixedSetup() { const el = document.getElementById('onboard-form'); if (!el)
    return; const f = new FormData(el); setupFixed = setupFixed.map((x, i) => ({ description: formString(f, `fd-${i}`), amount: formString(f, `fa-${i}`), category: formString(f, `fc-${i}`), dueDay: formString(f, `fv-${i}`) })); }
async function finishSetup() { try {
    const amt = ensureAmount(setupSalary);
    const m = currentMonth();
    const fixed = [];
    for (const x of setupFixed) {
        if (!x.description && !x.amount)
            continue;
        if (!x.description)
            throw new Error('Informe o nome de todas as contas preenchidas.');
        fixed.push({ id: uid(), seriesId: uid(), description: x.description.slice(0, 160), category: x.category || 'Contas', amount: ensureAmount(x.amount), dueDay: Math.max(1, Math.min(31, Number(x.dueDay) || 10)), startMonth: m, paidMonths: [] });
    }
    data = { ...newData(), setup: true, percent: setupPercent, percentVersions: [{ startMonth: m, percent: setupPercent }], incomes: [{ id: uid(), description: 'Salário principal', amount: amt, date: isoLocal(now()), kind: 'Salário', recurring: true, startMonth: m }], fixed };
    month = m;
    page = 'dashboard';
    await save('Configuração inicial concluída.');
}
catch (e) {
    flash(e.message, 'error');
} }
async function saveEntity(form) {
    if (busy)
        return;
    busy = true;
    try {
        const kind = form.dataset.kind || '', id = form.dataset.id || '';
        const f = new FormData(form);
        const date = formString(f, 'date') || isoLocal(now());
        if (kind === 'income') {
            const description = formString(f, 'description');
            if (!description)
                throw new Error('Informe a descrição da receita.');
            const amount = ensureAmount(formString(f, 'amount'));
            safeDate(date);
            const type = formString(f, 'kind');
            const recurring = f.get('recurring') === 'on';
            let x = data.incomes.find(i => i.id === id);
            if (x) {
                const useMonth = x.recurring ? month : monthOf(x.date);
                if (x.recurring && useMonth > x.startMonth) {
                    const previous = x;
                    x = { ...previous, id: uid(), startMonth: useMonth, date: `${useMonth}-${date.slice(8)}`, endMonth: previous.endMonth };
                    previous.endMonth = addMonth(useMonth, -1);
                    data.incomes.push(x);
                }
                Object.assign(x, { description, amount, date, kind: type, recurring, startMonth: recurring ? (x.recurring ? x.startMonth : monthOf(date)) : monthOf(date) });
                if (!recurring)
                    delete x.endMonth;
            }
            else
                data.incomes.push({ id: uid(), description, amount, date, kind: type, recurring, startMonth: monthOf(date) });
        }
        else if (kind === 'fixed') {
            const description = formString(f, 'description');
            if (!description)
                throw new Error('Informe o nome da conta.');
            const amount = ensureAmount(formString(f, 'amount'));
            const category = formString(f, 'category');
            const dueDay = Number(formString(f, 'dueDay'));
            if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
                throw new Error('O vencimento deve estar entre 1 e 31.');
            let x = data.fixed.find(i => i.id === id);
            if (x) {
                if (month > x.startMonth) {
                    const previous = x;
                    const next = { ...previous, id: uid(), startMonth: month, paidMonths: previous.paidMonths.filter(p => p >= month) };
                    previous.paidMonths = previous.paidMonths.filter(p => p < month);
                    previous.endMonth = addMonth(month, -1);
                    data.fixed.push(next);
                    x = next;
                }
                Object.assign(x, { description, amount, category, dueDay });
            }
            else
                data.fixed.push({ id: uid(), seriesId: uid(), description, amount, category, dueDay, startMonth: month, paidMonths: [] });
        }
        else if (kind === 'expense') {
            const description = formString(f, 'description');
            if (!description)
                throw new Error('Informe a descrição do gasto.');
            const amount = ensureAmount(formString(f, 'amount'));
            safeDate(date);
            const category = formString(f, 'category');
            const x = data.expenses.find(i => i.id === id);
            if (x)
                Object.assign(x, { description, amount, date, category });
            else
                data.expenses.push({ id: uid(), description, amount, date, category });
        }
        else if (kind === 'goal') {
            const name = formString(f, 'name');
            if (!name)
                throw new Error('Informe o nome da meta.');
            const target = ensureAmount(formString(f, 'target'));
            const initial = amountToCents(formString(f, 'initial') || '0');
            if (!Number.isSafeInteger(initial) || initial < 0)
                throw new Error('Valor inicial inválido.');
            const dueDate = formString(f, 'dueDate');
            if (dueDate)
                safeDate(dueDate);
            const x = data.goals.find(i => i.id === id);
            if (x) {
                if (data.movements.some(m => m.fromGoal === id || m.toGoal === id) && initial !== x.initial)
                    throw new Error('O valor inicial não pode ser alterado após movimentações.');
                Object.assign(x, { name, target, initial, dueDate: dueDate || undefined });
            }
            else
                data.goals.push({ id: uid(), name, target, initial, startDate: isoLocal(now()), dueDate: dueDate || undefined });
        }
        else if (kind === 'movement' || kind === 'transfer') {
            const amount = ensureAmount(formString(f, 'amount'));
            safeDate(date);
            const note = formString(f, 'note').slice(0, 500);
            let item;
            if (kind === 'movement') {
                const movementKind = formString(f, 'kind');
                const account = formString(f, 'account') || null;
                if (account && !data.goals.some(g => g.id === account && !g.archived))
                    throw new Error('Cofrinho inválido.');
                if (movementKind === 'withdraw' && goalBalance(data, account) < amount)
                    throw new Error('Saldo insuficiente para realizar esta retirada.');
                item = { id: uid(), date, kind: movementKind, amount, fromGoal: movementKind === 'withdraw' ? account : null, toGoal: movementKind === 'deposit' ? account : null, note };
            }
            else {
                const from = formString(f, 'from') || null, to = formString(f, 'to') || null;
                if (from === to)
                    throw new Error('Selecione contas diferentes para a transferência.');
                if ((from && !data.goals.some(g => g.id === from)) || (to && !data.goals.some(g => g.id === to)))
                    throw new Error('Objetivo inválido.');
                if (goalBalance(data, from) < amount)
                    throw new Error(`Saldo insuficiente no cofrinho de origem (${money(goalBalance(data, from))}).`);
                item = { id: uid(), date, kind: 'transfer', amount, fromGoal: from, toGoal: to, note };
            }
            data.movements.push(item);
        }
        modal = null;
        await save('Registro salvo com sucesso.');
    }
    catch (e) {
        flash(e.message || 'Não foi possível salvar.', 'error');
    }
    finally {
        busy = false;
    }
}
async function deletion(kind, id) {
    let name = 'este registro';
    if (kind === 'income')
        name = data.incomes.find(x => x.id === id)?.description || name;
    if (kind === 'fixed')
        name = data.fixed.find(x => x.id === id)?.description || name;
    if (kind === 'expense')
        name = data.expenses.find(x => x.id === id)?.description || name;
    if (kind === 'movement')
        name = 'esta movimentação';
    if (!confirm(`Confirma a exclusão de "${name}"? ${kind === 'fixed' || kind === 'income' ? 'Para registros recorrentes, os meses anteriores continuarão preservados.' : 'Esta ação não pode ser desfeita sem um backup.'}`))
        return;
    if (kind === 'income') {
        const x = data.incomes.find(x => x.id === id);
        if (x) {
            if (x.recurring && x.startMonth < month)
                x.endMonth = addMonth(month, -1);
            else
                data.incomes = data.incomes.filter(r => r.id !== id);
        }
    }
    if (kind === 'fixed') {
        const x = data.fixed.find(x => x.id === id);
        if (x) {
            if (x.startMonth < month)
                x.endMonth = addMonth(month, -1);
            else
                data.fixed = data.fixed.filter(r => r.id !== id);
        }
    }
    if (kind === 'expense')
        data.expenses = data.expenses.filter(x => x.id !== id);
    if (kind === 'movement') {
        const x = data.movements.find(m => m.id === id);
        if (x) {
            const copy = { ...data, movements: data.movements.filter(m => m.id !== id) };
            if (data.goals.some(g => goalBalance(copy, g.id) < 0) || goalBalance(copy, null) < 0) {
                flash('Não é possível excluir: isso deixaria um cofrinho com saldo negativo. Reverta as operações posteriores antes.', 'error');
                return;
            }
            data.movements = copy.movements;
        }
    }
    await save('Registro excluído.');
}
async function archiveGoal(id) { const g = data.goals.find(g => g.id === id); if (!g)
    return; if (g.archived) {
    g.archived = false;
    return save('Meta reativada.');
} const hasMoves = data.movements.some(x => x.fromGoal === id || x.toGoal === id); if (hasMoves || goalBalance(data, id) > 0) {
    if (!confirm(`"${g.name}" possui saldo ou histórico. Deseja arquivá-la? Seus movimentos serão preservados.`))
        return;
    g.archived = true;
    await save('Meta arquivada.');
}
else {
    if (!confirm(`Excluir "${g.name}" permanentemente?`))
        return;
    data.goals = data.goals.filter(x => x.id !== id);
    await save('Meta excluída.');
} }
function downloadText(name, body, mime) { const blob = new Blob(['\ufeff', body], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function exportCSV() {
    const items = [];
    for (const i of selectedIncomes(data, month))
        items.push({ date: i.recurring ? `${month}-${String(Math.min(Number(i.date.slice(8)), new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate())).padStart(2, '0')}` : i.date, type: 'Receita', description: i.description, category: i.kind, amount: i.amount, extra: i.recurring ? 'Recorrente' : 'Pontual' });
    for (const x of selectedFixed(data, month))
        items.push({ date: `${month}-${String(Math.min(x.dueDay, new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate())).padStart(2, '0')}`, type: 'Despesa fixa', description: x.description, category: x.category, amount: -x.amount, extra: x.paidMonths.includes(month) ? 'Paga' : 'Pendente' });
    for (const x of selectedExpenses(data, month))
        items.push({ date: x.date, type: 'Gasto variável', description: x.description, category: x.category, amount: -x.amount, extra: '' });
    for (const x of selectedMovements(data, month))
        items.push({ date: x.date, type: x.kind === 'deposit' ? 'Depósito' : x.kind === 'withdraw' ? 'Retirada' : 'Transferência interna', description: x.note, category: 'Economia', amount: x.kind === 'transfer' ? 0 : x.kind === 'withdraw' ? -x.amount : x.amount, extra: 'Não é despesa nem receita' });
    const q = (v, guard = true) => { const raw = String(v); const safe = guard && /^[=+@\t\r\n-]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; };
    const csv = ['Data;Tipo;Descrição;Categoria;Valor (R$);Observação', ...items.sort((a, b) => a.date.localeCompare(b.date)).map(x => [x.date, x.type, x.description, x.category, (x.amount / 100).toFixed(2).replace('.', ','), x.extra].map((v, i) => q(v, i !== 4)).join(';'))].join('\r\n');
    downloadText(`FinanceFlow-${month}.csv`, csv, 'text/csv;charset=utf-8');
    flash('Relatório CSV exportado.');
}
async function importBackup(file) { if (file.size > 10 * 1024 * 1024)
    throw new Error('Arquivo grande demais (limite de 10 MB).'); let obj; try {
    obj = JSON.parse(await file.text());
}
catch {
    throw new Error('O arquivo não contém JSON válido.');
} const restored = validateData(obj); if (!confirm('Restaurar backup e SUBSTITUIR todos os dados financeiros desta conta na nuvem? Faça um backup antes se precisar preservá-los.'))
    return; data = restored; modal = null; page = 'dashboard'; month = currentMonth(); await save('Backup restaurado e sincronizado com sua conta.'); }
function syncSetupRange() { const el = document.getElementById('setupRange'); if (!el)
    return; setupPercent = Number(el.value); const p = document.getElementById('setupPct'); if (p)
    p.textContent = `${setupPercent}%`; const m = document.getElementById('setupMoney'); if (m)
    m.textContent = money(Math.round(amountToCents(setupSalary || '0') * setupPercent / 100)); }
function setupSubmit(form) {
    if (setupStep === 0) {
        const f = new FormData(form);
        setupSalary = formString(f, 'salary');
        try {
            ensureAmount(setupSalary);
        }
        catch (e) {
            flash(e.message, 'error');
            return;
        }
        if (!setupFixed.length)
            setupFixed = [{ description: '', category: 'Contas', amount: '', dueDay: '10' }];
        setupStep++;
        render();
    }
    else if (setupStep === 1) {
        readFixedSetup();
        for (const x of setupFixed) {
            if (x.description || x.amount) {
                try {
                    if (!x.description)
                        throw new Error('Preencha o nome da conta.');
                    ensureAmount(x.amount);
                }
                catch (e) {
                    flash(e.message, 'error');
                    return;
                }
            }
        }
        setupFixed = setupFixed.filter(x => x.description || x.amount);
        setupStep++;
        render();
    }
    else if (setupStep === 2) {
        syncSetupRange();
        setupStep++;
        render();
    }
}
function bindEvents() {
    document.addEventListener('submit', e => {
        const f = e.target;
        if (f.id === 'cloud-auth-form') {
            e.preventDefault();
            void cloudAuthSubmit(f);
            return;
        }
        if (f.id === 'cloud-reset-form') {
            e.preventDefault();
            void cloudChangePassword(f);
            return;
        }
        if (f.id === 'onboard-form') {
            e.preventDefault();
            setupSubmit(f);
        }
        if (f.id === 'entity-form') {
            e.preventDefault();
            void saveEntity(f);
        }
    });
    document.addEventListener('input', e => { const el = e.target; if (el.id === 'setupRange')
        syncSetupRange(); if (el.id === 'saving-range') {
        const value = Number(el.value);
        const m = calc(data, month);
        const t = Math.round(m.income * value / 100);
        const label = document.getElementById('pctLabel');
        if (label)
            label.textContent = `${value}%`;
        const tp = document.getElementById('targetPreview');
        if (tp)
            tp.textContent = money(t);
        const sp = document.getElementById('spendPreview');
        if (sp)
            sp.textContent = money(m.income - t);
    } });
    document.addEventListener('change', e => { const el = e.target; if (el.id === 'saving-range') {
        const value = Math.min(100, Math.max(0, Number(el.value)));
        const versions = data.percentVersions || [];
        const found = versions.find(v => v.startMonth === month);
        if (found)
            found.percent = value;
        else
            versions.push({ startMonth: month, percent: value });
        data.percentVersions = versions;
        void save('Porcentagem de economia atualizada.');
    } if (el.id === 'backupFile' && el.files?.[0]) {
        void importBackup(el.files[0]).catch(err => flash(err.message, 'error'));
        el.value = '';
    } if (el.hasAttribute('data-filter')) {
        filters[el.dataset.filter || ''] = el.value;
        render();
    } });
    document.addEventListener('click', e => {
        const target = e.target;
        const b = target.closest('[data-action]');
        if (!b)
            return;
        const a = b.dataset.action || '';
        const kind = b.dataset.kind || '', id = b.dataset.id || '';
        if (a === 'cloud-switch') {
            cloudAuthMode = cloudAuthMode === 'login' ? 'signup' : 'login';
            cloudMessage = '';
            render();
            return;
        }
        if (a === 'cloud-forgot') {
            void cloudForgot();
            return;
        }
        if (a === 'cloud-retry') {
            void cloudStart();
            return;
        }
        if (a === 'cloud-retry-sync') {
            void cloudTrySync().catch(e => flash(e.message, 'error'));
            return;
        }
        if (a === 'cloud-exit') {
            cloudSession = null;
            localStorage.removeItem(CLOUD_SESSION_KEY);
            cloudState = 'auth';
            cloudMessage = '';
            render();
            return;
        }
        if (a === 'cloud-logout') {
            void cloudLogout();
            return;
        }
        if (a === 'cloud-export') {
            downloadText(`FinanceFlow-nao-sincronizado-${isoLocal(now())}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
            return;
        }
        if (a === 'cloud-discard') {
            void cloudLoadRemote();
            return;
        }
        if (a === 'close-modal' && target.closest('.modal-dialog') && b === target.closest('.modal-backdrop'))
            return;
        if (a === 'dismiss-toast') {
            notice = null;
            document.querySelector('.toast')?.remove();
            return;
        }
        if (a === 'navigate') {
            page = (b.dataset.page || 'dashboard');
            sidebarOpen = false;
            modal = null;
            render();
            document.querySelector('.main')?.scrollTo({ top: 0 });
            return;
        }
        if (a === 'prev-month') {
            month = addMonth(month, -1);
            render();
            return;
        }
        if (a === 'next-month') {
            month = addMonth(month, 1);
            render();
            return;
        }
        if (a === 'today') {
            month = currentMonth();
            render();
            return;
        }
        if (a === 'open-sidebar') {
            sidebarOpen = true;
            render();
            return;
        }
        if (a === 'close-sidebar') {
            sidebarOpen = false;
            render();
            return;
        }
        if (a === 'open') {
            modal = { type: kind, id: undefined, goal: b.dataset.goal || '' };
            render();
            setTimeout(() => { document.querySelector('.modal-dialog input:not([type="checkbox"])')?.focus(); }, 30);
            return;
        }
        if (a === 'close-modal') {
            modal = null;
            render();
            return;
        }
        if (a === 'edit') {
            modal = { type: kind, id };
            render();
            return;
        }
        if (a === 'delete') {
            void deletion(kind, id);
            return;
        }
        if (a === 'archive') {
            void archiveGoal(id);
            return;
        }
        if (a === 'paid') {
            const f = data.fixed.find(x => x.id === id);
            if (f) {
                if (f.paidMonths.includes(month))
                    f.paidMonths = f.paidMonths.filter(x => x !== month);
                else
                    f.paidMonths.push(month);
                void save('Status da conta atualizado.');
            }
            return;
        }
        if (a === 'clear-filter') {
            filters = { period: 'month', category: '', min: '', max: '', search: '' };
            render();
            return;
        }
        if (a === 'export-csv') {
            exportCSV();
            return;
        }
        if (a === 'export-json') {
            downloadText(`FinanceFlow-backup-${isoLocal(now())}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
            flash('Backup JSON exportado.');
            return;
        }
        if (a === 'import-json') {
            document.getElementById('backupFile')?.click();
            return;
        }
        if (a === 'theme') {
            applyTheme(b.dataset.theme || 'system');
            flash('Tema alterado.');
            return;
        }
        if (a === 'toggle-theme') {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
            return;
        }
        if (a === 'toggle-archive') {
            viewArchived = !viewArchived;
            render();
            return;
        }
        if (a === 'reset') {
            if (!confirm('APAGAR DEFINITIVAMENTE todos os registros desta conta, inclusive na nuvem? Você só poderá recuperá-los por um backup JSON.'))
                return;
            if (!confirm('Última confirmação: deseja realmente redefinir o FinanceFlow?'))
                return;
            data = newData();
            setupStep = 0;
            setupSalary = '';
            setupFixed = [];
            void save('Aplicativo redefinido.');
            return;
        }
        if (a === 'setup-back') {
            readFixedSetup();
            setupStep = Math.max(0, setupStep - 1);
            render();
            return;
        }
        if (a === 'setup-add') {
            readFixedSetup();
            setupFixed.push({ description: '', category: 'Contas', amount: '', dueDay: '10' });
            render();
            return;
        }
        if (a === 'setup-remove') {
            readFixedSetup();
            setupFixed.splice(Number(b.dataset.index), 1);
            render();
            return;
        }
        if (a === 'setup-finish') {
            void finishSetup();
            return;
        }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') {
        if (modal) {
            modal = null;
            render();
        }
        else if (sidebarOpen) {
            sidebarOpen = false;
            render();
        }
    } });
}
async function init() { let savedTheme = 'system'; try {
    savedTheme = localStorage.getItem('financeflow-theme') || 'system';
}
catch { } applyTheme(savedTheme); bindEvents(); cloudInstallHooks(); await cloudStart(); }
void init();
