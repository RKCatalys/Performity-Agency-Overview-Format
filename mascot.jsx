/* mascot.jsx — centralized mascot system (single source of truth).
   One sprite sheet, 7 reaction states, cropped to assets/mascots/*.png.
   Exposes window.Mascot (component) + window.MASCOTS (state config). */
const MASCOTS = {
  idle:     { src: "assets/mascots/success.png",  fx: "idle",     caption: "Welcome back" },
  success:  { src: "assets/mascots/success.png",  fx: "success",  caption: "You're in! 🎉" },
  warn:     { src: "assets/mascots/warn.png",     fx: "warn",     caption: "Hmm, that's not right." },
  serious:  { src: "assets/mascots/serious.png",  fx: "serious",  caption: "Double-check those details." },
  thinking: { src: "assets/mascots/thinking.png", fx: "thinking", caption: "Need a hand?" },
  angry:    { src: "assets/mascots/angry.png",    fx: "angry",    caption: "Careful now…" },
  locked:   { src: "assets/mascots/locked.png",   fx: "locked",   caption: "Account locked." },
  furious:  { src: "assets/mascots/furious.png",  fx: "furious",  caption: "Access blocked." },
};
// pick a reaction from a login context
function mascotFor({ attempts = 0, locked = false, thinking = false, success = false } = {}) {
  if (success) return "success";
  if (locked) return "locked";
  if (thinking) return "thinking";
  if (attempts >= 8) return "furious";
  if (attempts >= 6) return "angry";
  if (attempts >= 3) return "serious";
  if (attempts >= 1) return "warn";
  return "idle";
}
function Mascot({ state = "idle", size = 200, caption = true }) {
  const m = MASCOTS[state] || MASCOTS.idle;
  const glow = state === "furious" || state === "angry";
  return (
    <div className="mascot" style={{ width: size }}>
      <div className="mascot-float">
        {glow && <div className={"mascot-glow " + state} />}
        <div className={"mascot-fx m-" + m.fx} key={state}>
          <img className="mascot-img" src={m.src} alt="Performity mascot" loading="lazy" style={{ maxHeight: size }} />
        </div>
      </div>
      {caption && m.caption && <div className={"mascot-caption " + (state === "furious" || state === "angry" ? "bad" : state === "success" ? "good" : "")}>{m.caption}</div>}
    </div>
  );
}
window.MASCOTS = MASCOTS;
window.mascotFor = mascotFor;
window.Mascot = Mascot;
