'use strict';

function nextBusinessDay(value) {
  const date = new Date(value);
  do { date.setDate(date.getDate() + 1); } while ([0, 6].includes(date.getDay()));
  return date;
}

function localDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function capacityPlan(jobs = [], options = {}) {
  const dailyMinutes = Math.max(60, Number(options.dailyMinutes || 480));
  const start = new Date(options.start || new Date());
  start.setHours(0, 0, 0, 0);
  while ([0, 6].includes(start.getDay())) start.setDate(start.getDate() + 1);
  const resources = new Map();
  const result = [];
  jobs.slice().sort((a, b) => new Date(a.dueDate || '9999-12-31') - new Date(b.dueDate || '9999-12-31')).forEach(job => {
    const resourceId = String(job.resourceId || job.workerId || 'unassigned');
    let cursor = resources.get(resourceId) || { date: new Date(start), used: 0 };
    let remaining = Math.max(0, Number(job.remainingMinutes ?? job.estimatedMinutes ?? 0));
    const segments = [];
    while (remaining > 0) {
      const available = dailyMinutes - cursor.used;
      const allocated = Math.min(remaining, available);
      segments.push({ date: localDateKey(cursor.date), minutes: allocated });
      cursor.used += allocated; remaining -= allocated;
      if (cursor.used >= dailyMinutes && remaining > 0) cursor = { date: nextBusinessDay(cursor.date), used: 0 };
    }
    const finishDate = segments.at(-1)?.date || localDateKey(cursor.date);
    result.push({ ...job, resourceId, segments, finishDate, late: Boolean(job.dueDate && finishDate > String(job.dueDate).slice(0, 10)) });
    resources.set(resourceId, cursor);
  });
  return { dailyMinutes, jobs: result, lateJobs: result.filter(job => job.late).length };
}

module.exports = { capacityPlan, nextBusinessDay, localDateKey };
