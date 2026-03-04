/**
 * PingIsUp Plan Limits Enforcement
 *
 * Reads plan limits from environment variables set by the PingIsUp backend
 * when provisioning the Uptime Kuma instance.
 *
 * Env vars:
 *   PINGISUP_MAX_MONITORS       - Max number of monitors allowed
 *   PINGISUP_MIN_INTERVAL       - Min check interval in seconds
 *   PINGISUP_HISTORY_DAYS       - Max history retention in days
 *   PINGISUP_PLAN               - Plan name (for display)
 */

const { R } = require("redbean-node");
const { log } = require("../src/util");

/**
 * Get plan limits from environment variables.
 * Returns null if no plan limits are configured (unrestricted).
 */
function getPlanLimits() {
    const maxMonitors = parseInt(process.env.PINGISUP_MAX_MONITORS);
    const minInterval = parseInt(process.env.PINGISUP_MIN_INTERVAL);
    const historyDays = parseInt(process.env.PINGISUP_HISTORY_DAYS);
    const plan = process.env.PINGISUP_PLAN || null;

    if (isNaN(maxMonitors) && isNaN(minInterval)) {
        return null; // No limits configured
    }

    return {
        maxMonitors: isNaN(maxMonitors) ? Infinity : maxMonitors,
        minInterval: isNaN(minInterval) ? 20 : minInterval,
        historyDays: isNaN(historyDays) ? 365 : historyDays,
        plan: plan,
    };
}

/**
 * Check if adding a new monitor would exceed the plan limit.
 * @param {number} userID
 * @throws {Error} if limit exceeded
 */
async function checkMonitorLimit(userID) {
    const limits = getPlanLimits();
    if (!limits) {
        return;
    }

    const count = await R.count("monitor", " user_id = ? ", [userID]);
    if (count >= limits.maxMonitors) {
        throw new Error(
            `Monitor limit reached (${limits.maxMonitors} monitors on ${limits.plan || "your"} plan). Please upgrade your plan to add more monitors.`
        );
    }
}

/**
 * Enforce minimum interval on a monitor object.
 * Clamps the interval to the plan minimum if it's too low.
 * @param {object} monitor - The monitor data object
 * @returns {object} monitor with interval enforced
 */
function enforceInterval(monitor) {
    const limits = getPlanLimits();
    if (!limits) {
        return monitor;
    }

    if (monitor.interval && monitor.interval < limits.minInterval) {
        log.info("plan-limits", `Clamping interval from ${monitor.interval}s to ${limits.minInterval}s (plan: ${limits.plan})`);
        monitor.interval = limits.minInterval;
    }

    if (monitor.retryInterval && monitor.retryInterval < limits.minInterval) {
        monitor.retryInterval = limits.minInterval;
    }

    return monitor;
}

/**
 * Log plan limits on startup.
 */
function logPlanLimits() {
    const limits = getPlanLimits();
    if (limits) {
        log.info("plan-limits", `PingIsUp Plan: ${limits.plan || "custom"}`);
        log.info("plan-limits", `  Max monitors: ${limits.maxMonitors}`);
        log.info("plan-limits", `  Min interval: ${limits.minInterval}s`);
        log.info("plan-limits", `  History days: ${limits.historyDays}`);
    }
}

module.exports = {
    getPlanLimits,
    checkMonitorLimit,
    enforceInterval,
    logPlanLimits,
};
