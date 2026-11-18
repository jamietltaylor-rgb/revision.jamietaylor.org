// Which papers each GCSE subject has, per exam board. Used to ask "which paper?" once the exam board is known.
// Paper names are short descriptions of the published GCSE papers. If a subject/board is not listed, the app lets you type a paper name instead.
const L = (...a) => a;
const FOUR = L("Paper 1 – Listening", "Paper 2 – Speaking", "Paper 3 – Reading", "Paper 4 – Writing");
const SIX = (x) => L(`Paper 1 – Biology 1`, `Paper 2 – Biology 2`, `Paper 3 – Chemistry 1`, `Paper 4 – Chemistry 2`, `Paper 5 – Physics 1`, `Paper 6 – Physics 2`);

export const PAPER_LISTS = [
  { id: "maths", test: /\b(maths?|mathematics)\b/i, boards: {
    AQA: L("Paper 1 – Non-calculator", "Paper 2 – Calculator", "Paper 3 – Calculator"),
    Edexcel: L("Paper 1 – Non-calculator", "Paper 2 – Calculator", "Paper 3 – Calculator"),
    OCR: L("Paper 1 – Non-calculator", "Paper 2 – Calculator", "Paper 3 – Calculator"),
    "WJEC / Eduqas": L("Component 1 – Non-calculator", "Component 2 – Calculator"),
    SQA: L("Paper 1 – Non-calculator", "Paper 2 – Calculator"),
  } },
  { id: "combined", test: /combined|trilogy|synergy|double award/i, boards: { AQA: SIX(), Edexcel: SIX(), OCR: SIX() } },
  { id: "biology", test: /\bbiology\b/i, boards: {
    AQA: L("Paper 1", "Paper 2"), Edexcel: L("Paper 1", "Paper 2"),
    OCR: L("Paper 1 – Breadth in biology", "Paper 2 – Depth in biology"),
    "WJEC / Eduqas": L("Component 1 – Concepts in biology", "Component 2 – Applications of biology") } },
  { id: "chemistry", test: /\bchemistry\b/i, boards: {
    AQA: L("Paper 1", "Paper 2"), Edexcel: L("Paper 1", "Paper 2"),
    OCR: L("Paper 1 – Breadth in chemistry", "Paper 2 – Depth in chemistry"),
    "WJEC / Eduqas": L("Component 1 – Concepts in chemistry", "Component 2 – Applications of chemistry") } },
  { id: "physics", test: /\bphysics\b/i, boards: {
    AQA: L("Paper 1", "Paper 2"), Edexcel: L("Paper 1", "Paper 2"),
    OCR: L("Paper 1 – Breadth in physics", "Paper 2 – Depth in physics"),
    "WJEC / Eduqas": L("Component 1 – Concepts in physics", "Component 2 – Applications of physics") } },
  { id: "english-lit", test: /english lit|\blit(erature)?\b/i, boards: {
    AQA: L("Paper 1 – Shakespeare and the 19th-century novel", "Paper 2 – Modern texts and poetry"),
    Edexcel: L("Paper 1 – Shakespeare and post-1914 literature", "Paper 2 – 19th-century novel and poetry since 1789"),
    OCR: L("Component 1 – Modern and literary heritage texts", "Component 2 – Poetry and Shakespeare"),
    "WJEC / Eduqas": L("Component 1 – Shakespeare and poetry", "Component 2 – Post-1914 prose/drama, 19th-century prose and unseen poetry") } },
  { id: "english-lang", test: /english( lang(uage)?)?$|english lang|^language$/i, boards: {
    AQA: L("Paper 1 – Explorations in creative reading and writing", "Paper 2 – Writers' viewpoints and perspectives"),
    Edexcel: L("Paper 1 – Fiction and imaginative writing", "Paper 2 – Non-fiction and transactional writing"),
    OCR: L("Paper 1 – Communicating information and ideas", "Paper 2 – Exploring effects and impact"),
    "WJEC / Eduqas": L("Component 1 – 20th-century literature reading and creative prose writing", "Component 2 – 19th and 21st-century non-fiction reading and transactional writing") } },
  { id: "history", test: /\bhistory\b/i, boards: {
    AQA: L("Paper 1 – Understanding the modern world", "Paper 2 – Shaping the nation"),
    Edexcel: L("Paper 1 – Thematic study and historic environment", "Paper 2 – Period study and British depth study", "Paper 3 – Modern depth study") } },
  { id: "geography", test: /\bgeography\b/i, boards: {
    AQA: L("Paper 1 – Living with the physical environment", "Paper 2 – Challenges in the human environment", "Paper 3 – Geographical applications"),
    Edexcel: L("Paper 1 – Global geographical issues", "Paper 2 – UK geographical issues", "Paper 3 – People and environment issues") } },
  { id: "business", test: /\b(business|enterprise)\b/i, boards: {
    AQA: L("Paper 1 – Influences of operations and HRM on business activity", "Paper 2 – Influences of marketing and finance on business activity"),
    Edexcel: L("Paper 1 – Investigating small business (Theme 1)", "Paper 2 – Building a business (Theme 2)"),
    OCR: L("Paper 1 – Business 1", "Paper 2 – Business 2") } },
  { id: "computer-science", test: /computer science|computing/i, boards: {
    AQA: L("Paper 1 – Computational thinking and programming skills", "Paper 2 – Computing concepts"),
    Edexcel: L("Paper 1 – Principles of computer science", "Paper 2 – Application of computational thinking"),
    OCR: L("Paper 1 – Computer systems", "Paper 2 – Computational thinking, algorithms and programming") } },
  { id: "languages", test: /\b(french|spanish|german|italian)\b/i, boards: { AQA: FOUR, Edexcel: FOUR, OCR: FOUR } },
  { id: "psychology", test: /psychology/i, boards: { AQA: L("Paper 1 – Cognition and behaviour", "Paper 2 – Social context and behaviour") } },
  { id: "sociology", test: /sociology/i, boards: { AQA: L("Paper 1 – Families and education", "Paper 2 – Crime and deviance and social stratification") } },
  { id: "re", test: /religious|\bre\b|\brs\b/i, boards: { AQA: L("Paper 1 – Study of religions: beliefs, teachings and practices", "Paper 2 – Thematic studies") } },
];

/** The papers for this subject and exam board, or null if none are known. */
export function papersFor(subject, topic, board) {
  const name = String(subject || "").trim() || String(topic || "").trim();
  if (!name || !board || board === "Any exam board") return null;
  const hit = PAPER_LISTS.find((p) => p.test.test(name));
  const list = hit && hit.boards[board];
  return list && list.length > 1 ? list : null;
}
