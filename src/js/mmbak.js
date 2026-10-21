function mmImport(db) {
  const q = (sql) => {
    const r = db.exec(sql);
    if (!r.length) return [];
    const { columns, values } = r[0];
    return values.map(v => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
  };
  const alive = v => v === null || v === 0 || v === '0';
  const splitEmoji = (s) => {
    s = (s || '').trim();
    const m = s.match(/^([^\p{L}\p{N}]+)\s*(.*)$/u);
    if (m && m[2]) return { emoji: m[1].trim(), name: m[2].trim() };
    return { emoji: '', name: s };
  };
  const txRows = q("SELECT ZDATE,ZTXDATESTR,ZDO_TYPE,ZAMOUNT,ZCONTENT,ZMEMO,ZCATEGORYUID,ZASSETUID,ZTOASSETUID,ZTXUIDTRANS,ZUID,ZISDEL FROM ZINOUTCOME").filter(r => alive(r.ZISDEL));
  const usedCats = new Set(txRows.map(r => r.ZCATEGORYUID).filter(Boolean));
  const usedAcc = new Set(txRows.flatMap(r => [r.ZASSETUID, r.ZTOASSETUID]).filter(Boolean));

  const groupsRaw = q('SELECT ZUID,ZASSETGROUPNAME,ZISDEL,ZORDER FROM ZASSETGROUP');
  const groupName = Object.fromEntries(groupsRaw.map(g => [g.ZUID, g.ZASSETGROUPNAME]));
  const groupOrder = Object.fromEntries(groupsRaw.map(g => [g.ZUID, g.ZORDER || 0]));

  const accounts = q('SELECT ZUID,ZNICNAME,ZGROUPUID,ZISDEL,ZORDER FROM ZASSET')
    .filter(a => a.ZISDEL !== 1 || usedAcc.has(a.ZUID))
    .map(a => ({
      id: a.ZUID,
      name: (a.ZNICNAME || '').trim(),
      group: (groupName[a.ZGROUPUID] || 'Otros').trim(),
      groupOrder: groupOrder[a.ZGROUPUID] || 999,
      order: a.ZORDER || 0,
      hidden: a.ZISDEL !== 0
    }))
    .sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order);

  const catsRaw = q('SELECT ZUID,ZNAME,ZPUID,ZDOTYPE,ZISDEL,ZORDER FROM ZCATEGORY')
    .filter(c => alive(c.ZISDEL) || usedCats.has(c.ZUID));
  const catIds = new Set(catsRaw.map(c => c.ZUID));
  const categories = catsRaw.map(c => {
    const { emoji, name } = splitEmoji(c.ZNAME);
    const parent = c.ZPUID && c.ZPUID !== '0' && catIds.has(c.ZPUID) ? c.ZPUID : null;
    return {
      id: c.ZUID, name, emoji,
      type: c.ZDOTYPE === 0 ? 'ingreso' : 'gasto',
      parentId: parent, order: c.ZORDER || 0,
      hidden: !alive(c.ZISDEL)
    };
  }).sort((a, b) => a.order - b.order);

  const toDate = r => r.ZTXDATESTR || new Date((r.ZDATE + 978307200) * 1000).toISOString().slice(0, 10);
  const transactions = [];
  for (const r of txRows) {
    const t = String(r.ZDO_TYPE);
    const base = {
      id: r.ZUID || ('mm' + Math.random().toString(36).slice(2)),
      date: toDate(r),
      ts: Math.round((r.ZDATE + 978307200) * 1000),
      amount: Math.round(Number(r.ZAMOUNT) || 0),
      note: [r.ZCONTENT, r.ZMEMO].filter(Boolean).join(' · ').trim()
    };
    if (t === '0' || t === '1') {
      transactions.push({ ...base, type: t === '0' ? 'ingreso' : 'gasto', accountId: r.ZASSETUID, categoryId: r.ZCATEGORYUID || null });
    } else if (t === '3') {
      transactions.push({ ...base, id: r.ZTXUIDTRANS || base.id, type: 'transferencia', accountId: r.ZASSETUID, toAccountId: r.ZTOASSETUID, note: base.note });
    } else if (t === '7' || t === '8') {
      transactions.push({ ...base, type: 'ajuste', accountId: r.ZASSETUID, amount: t === '7' ? base.amount : -base.amount, note: 'Ajuste de saldo' });
    }
  }
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);

  const budgets = {};
  const visible = new Set(categories.filter(c => !c.hidden).map(c => c.id));
  for (const b of q('SELECT ZBUDGETUID,ZAMOUNT,ZISDEL,ZBUDGETPERIOD FROM ZBUDGETAMOUNT ORDER BY ZBUDGETPERIOD')) {
    if (!alive(b.ZISDEL)) continue;
    const target = String(b.ZBUDGETUID).split('_')[0];
    if (visible.has(target)) budgets[target] = Math.round(b.ZAMOUNT);
  }
  for (const k of Object.keys(budgets)) if (!budgets[k]) delete budgets[k];
  const etc = Object.fromEntries(q('SELECT ZDATAYTYPEKEY,ZDATA FROM ZETC').filter(e => e.ZDATAYTYPEKEY).map(e => [e.ZDATAYTYPEKEY, e.ZDATA]));
  const startDay = Math.min(28, Math.max(1, parseInt(etc.start_day, 10) || 1));
  return { version: 1, source: 'moneymanager', importedAt: Date.now(), settings: { startDay }, accounts, categories, transactions, budgets };
}
if (typeof module !== 'undefined') module.exports = { mmImport };
