// Things you can unlock with points: colour themes, headline fonts and hats for your study buddy.

const PALETTES = [
  // name, background, ink (text/buttons), price
  ["Paper", "#F3EFE7", "#141414", 0],
  ["Night", "#141414", "#F3EFE7", 0],
  ["Linen", "#EAE0D7", "#222F19", 100],
  ["Slate", "#262839", "#EAF0F2", 100],
  ["Lilac", "#E6DFF2", "#330894", 100],
  ["Sage", "#D1DED7", "#581D25", 100],
  ["Pistachio", "#BFE0A0", "#15331B", 100],
  ["Lido", "#79C3E0", "#002A3D", 100],
  ["Tangerine", "#FF533B", "#191919", 200],
  ["Allotment", "#193428", "#F2E5CA", 200],
  ["Sherbet", "#FFCD4A", "#191932", 200],
  ["Harbour", "#003249", "#FEFFFE", 200],
  ["Postbox", "#FFF9EE", "#C41523", 200],
  ["Grape", "#352D7D", "#FEB02E", 200],
  ["Midnight", "#0D1121", "#F8D26D", 200],
  ["Deep Sea", "#0E1C34", "#61D5FC", 200],
  ["Clay", "#CA4C3B", "#FFF2E1", 200],
  ["Hazard", "#000000", "#FF4720", 350],
  ["Christmas", "#063321", "#F8F2EA", 350],
  ["Halloween", "#382056", "#FF8030", 350],
];

const FONTS = [
  // name, Google Fonts family query, CSS font-family, price
  ["Archivo Black", "Archivo+Black", '"Archivo Black", sans-serif', 120],
  ["Bricolage Grotesque", "Bricolage+Grotesque:wght@700", '"Bricolage Grotesque", sans-serif', 120],
  ["DM Serif Display", "DM+Serif+Display", '"DM Serif Display", serif', 120],
  ["Fraunces", "Fraunces:wght@600;800", '"Fraunces", serif', 120],
  ["Rubik Mono One", "Rubik+Mono+One", '"Rubik Mono One", monospace', 150],
  ["Space Mono", "Space+Mono:wght@700", '"Space Mono", monospace', 120],
  ["Syne", "Syne:wght@700;800", '"Syne", sans-serif', 120],
  ["Anton", "Anton", '"Anton", sans-serif', 120],
  ["Bodoni Moda", "Bodoni+Moda:wght@600;800", '"Bodoni Moda", serif', 150],
  ["Unbounded", "Unbounded:wght@700", '"Unbounded", sans-serif', 150],
  ["Instrument Serif", "Instrument+Serif", '"Instrument Serif", serif', 150],
  ["Big Shoulders Display", "Big+Shoulders+Display:wght@800", '"Big Shoulders Display", sans-serif', 150],
];

const HATS = [
  ["🧢", "Cap", 50], ["👒", "Sun hat", 50], ["🎩", "Top hat", 60], ["🪖", "Helmet", 60],
  ["🕶️", "Cool shades", 70], ["🎓", "Graduation cap", 80], ["🎧", "Headphones", 90], ["👑", "Crown", 250],
];

export const ITEMS = [
  ...PALETTES.map(([name, bg, ink, price]) => ({ id: `palette:${name}`, kind: "palette", name, bg, ink, price })),
  ...FONTS.map(([name, family, css, price]) => ({ id: `font:${name}`, kind: "font", name, family, css, price })),
  ...HATS.map(([emoji, name, price]) => ({ id: `hat:${name}`, kind: "hat", name, emoji, price })),
];

export const itemById = (id) => ITEMS.find((i) => i.id === id);
export const itemsOfKind = (kind) => ITEMS.filter((i) => i.kind === kind);
export const isOwned = (state, id) => {
  const item = itemById(id);
  return Boolean(item) && (item.price === 0 || state.owned.includes(id));
};

/** Buys an item with spendable points (earned minus spent). */
export function buyItem(state, id) {
  const item = itemById(id);
  if (!item) return { ok: false, message: "That item doesn't exist." };
  if (isOwned(state, id)) return { ok: false, message: "You already have that." };
  const balance = state.stats.points - state.stats.spent;
  if (balance < item.price) return { ok: false, message: `You need ${item.price - balance} more points.` };
  state.stats.spent += item.price;
  state.owned.push(id);
  return { ok: true, message: `Unlocked ${item.name}!` };
}

/** Switches to an owned item. Pass id "" to go back to the original look for that kind. */
export function equipItem(state, kind, id) {
  if (!["palette", "font", "hat"].includes(kind)) return false;
  if (id !== "" && (!isOwned(state, id) || itemById(id).kind !== kind)) return false;
  state.equipped[kind] = id;
  return true;
}
