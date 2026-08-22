/**
 * Utility for evaluating cron expressions and calculating next run timestamps.
 * Standard 5-field format: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6).
 */
export class CronUtils {
  /**
   * Validates if a string is a valid standard 5-field cron expression or shorthand interval.
   */
  static isValidCron(cron: string): boolean {
    if (!cron || typeof cron !== 'string') return false;
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    // Check basic character validity for each field
    const fieldRegex = /^(\*|([0-9]+(-[0-9]+)?)(,[0-9]+(-[0-9]+)?)*|\*\/[0-9]+)$/;
    return parts.every((p) => fieldRegex.test(p));
  }

  /**
   * Calculates the next Date when the given cron expression should trigger after `fromDate`.
   */
  static getNextRunAt(cron: string, fromDate: Date = new Date(), timezone: string = 'UTC'): Date {
    const fromTime = fromDate.getTime();

    // Check for common step patterns e.g. "*/5 * * * *" -> every 5 minutes
    const parts = cron.trim().split(/\s+/);
    if (parts[0].startsWith('*/')) {
      const stepMinutes = parseInt(parts[0].replace('*/', ''), 10);
      if (!isNaN(stepMinutes) && stepMinutes > 0 && stepMinutes <= 59) {
        const intervalMs = stepMinutes * 60 * 1000;
        const nextTime = Math.ceil((fromTime + 1000) / intervalMs) * intervalMs;
        return new Date(nextTime);
      }
    }

    if (parts[1].startsWith('*/')) {
      const stepHours = parseInt(parts[1].replace('*/', ''), 10);
      if (!isNaN(stepHours) && stepHours > 0 && stepHours <= 23) {
        const intervalMs = stepHours * 60 * 60 * 1000;
        const nextTime = Math.ceil((fromTime + 1000) / intervalMs) * intervalMs;
        return new Date(nextTime);
      }
    }

    // Default fallback: Increment by 60 seconds for minute-level granularity or default 1 hour interval
    const targetMinute = parts[0] === '*' ? null : parseInt(parts[0], 10);
    const targetHour = parts[1] === '*' ? null : parseInt(parts[1], 10);

    const next = new Date(fromDate);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);

    for (let i = 0; i < 525600; i++) { // Max search 1 year in minutes
      const matchMin = targetMinute === null || next.getMinutes() === targetMinute;
      const matchHour = targetHour === null || next.getHours() === targetHour;

      if (matchMin && matchHour) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }

    // Fallback: 1 hour into future
    return new Date(fromTime + 3600 * 1000);
  }
}
