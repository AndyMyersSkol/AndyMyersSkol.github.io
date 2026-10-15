import { queryUsage } from "./report-plan.mjs";

// Hourly counters preserve Pacific date boundaries, including 23/25-hour days.
// Visitor memberships are deduplicated across the whole range, never summed.
export async function headlineSummary(db, dates, excludePersonal) {
  const queries = [
    db.prepare(`SELECT kind, bot, SUM(requests) AS requests,
      SUM(CASE WHEN visitor_hash != '' THEN requests ELSE 0 END) AS identified,
      SUM(CASE WHEN is_personal = 1 THEN requests ELSE 0 END) AS explicitPersonal,
      SUM(CASE WHEN is_personal = 1 AND visitor_hash != '' THEN requests ELSE 0 END) AS explicitPersonalIdentified
      FROM analytics_activity_hours WHERE occurred_at >= ? AND occurred_at < ? AND path != '/myers_term_limits.pdf'
      GROUP BY kind, bot ORDER BY kind, bot`).bind(dates.from, dates.until),
    db.prepare(`SELECT v.kind, v.bot,
      COUNT(DISTINCT CASE WHEN ? = 0 OR (v.is_personal = 0 AND p.visitor_hash IS NULL)
        THEN v.visitor_hash END) AS visitors,
      SUM(CASE WHEN v.is_personal = 0 AND p.visitor_hash IS NOT NULL THEN v.requests ELSE 0 END) AS registeredPersonal
      FROM analytics_activity_hours v LEFT JOIN personal_visitors p ON p.visitor_hash = v.visitor_hash
      WHERE v.occurred_at >= ? AND v.occurred_at < ? AND v.visitor_hash != '' AND v.path != '/myers_term_limits.pdf'
      GROUP BY v.kind, v.bot`).bind(excludePersonal ? 1 : 0, dates.from, dates.until),
  ];
  const [counts, memberships] = await db.batch(queries);
  const visitors = new Map(memberships.results.map(row => [JSON.stringify([row.kind, row.bot]), row]));
  const totals = [];
  let personalEvents = 0;
  for (const row of counts.results) {
    const member = visitors.get(JSON.stringify([row.kind, row.bot]));
    const registeredPersonal = member?.registeredPersonal || 0;
    const personal = row.explicitPersonal + registeredPersonal;
    const count = row.requests - (excludePersonal ? personal : 0);
    const identifiedRequests = row.identified - (excludePersonal ? row.explicitPersonalIdentified + registeredPersonal : 0);
    if (row.bot === 0 && ["page_view", "pdf_request", "outbound_click"].includes(row.kind)) personalEvents += personal;
    if (count > 0) totals.push({ kind: row.kind, bot: row.bot, count, visitors: member?.visitors || 0,
      identifiedRequests, unidentifiedRequests: count - identifiedRequests });
  }
  return { totals, personalActivity: { events: personalEvents },
    queryUsage: queryUsage([["hourlyCounts", counts], ["hourlyVisitors", memberships]]) };
}
