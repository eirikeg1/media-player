// Runs once in the parent process before any test worker starts.
//
// Tests that exercise local-time logic (day windows across DST, date keys)
// need a zone with daylight-saving transitions, and they need the same one on
// every machine. A test cannot switch zones itself: inside a Jest sandbox
// `process.env` is a copy, so assigning `TZ` there never reaches Node. Set
// here, the workers inherit it at spawn, where Node does honour it.
module.exports = () => {
  process.env.TZ = 'Europe/Oslo';
};
