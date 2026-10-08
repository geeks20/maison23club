/**
 * Countdown to the doors opening. The target is an absolute instant
 * (2026-10-23T20:00:00+04:00 — 8 PM in Asia/Dubai, which has no daylight saving),
 * so the result is the same whatever timezone the guest's device is in.
 */
(function (root) {
  'use strict';
  var DEFAULT_TARGET = '2026-10-23T20:00:00+04:00';
  var pad = function (n) { return String(n).padStart(2, '0'); };

  function compute(targetIso, nowMs) {
    var target = Date.parse(targetIso || DEFAULT_TARGET);
    if (!isFinite(target)) target = Date.parse(DEFAULT_TARGET);
    var diff = target - nowMs;
    if (diff <= 0) return { started: true, d: '00', h: '00', m: '00', s: '00' };
    // Count whole seconds remaining so the display never shows 00:00:00 before the start.
    var secs = Math.ceil(diff / 1000);
    return {
      started: false,
      d: pad(Math.floor(secs / 86400)),
      h: pad(Math.floor(secs / 3600) % 24),
      m: pad(Math.floor(secs / 60) % 60),
      s: pad(secs % 60)
    };
  }

  var api = { compute: compute, DEFAULT_TARGET: DEFAULT_TARGET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.M23Countdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
