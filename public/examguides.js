// Exam guides: how real UK exam papers are laid out and marked, per subject and exam board.
// Everything here is paraphrased from the exam boards' own published mark schemes and papers (no questions are copied),
// and is fed to the question maker (so questions look like the real thing) and to the marker (so it marks the way examiners do).
// To add a subject: add an entry to GUIDES. `sources` lists the papers it was read from. Boards use the names in logic.js BOARDS.

export const GUIDES = [
  {
    id: "business",
    subject: /\b(business|enterprise)\b/i,
    general: {
      style: "Case-study questions about a business (made-up or real) described in a short scenario. The command word shows the marks: 1 mark = state/identify/multiple choice; 2 marks = calculate, or two linked points; 3 marks = identify one (1) then explain it (2); 6 marks = Analyse; 9 marks = Justify (give a judgement); 12 marks = Evaluate and give a supported conclusion.",
      marking: "Generic answers that do not fit the business in the scenario are not credited. Several points with no development earn 1 mark at most. Two-mark linked points: 1 each, but unlinked points max 1. Calculations: 1 mark for the formula or substitution, 1 for the correct answer; a correct answer alone gets full marks. Extended answers are level-marked: 6 marks = knowledge/application plus analysis in chains of reasoning (L1 1-2, L2 3-4, L3 5-6); 9 marks adds a judgement (L1 1-3 simple unsupported judgement, L2 4-6 justified from sound evaluation, L3 7-9 clear judgement from thorough evaluation); 12 marks = L1 1-4, L2 5-8, L3 9-12 with a valid, well-reasoned conclusion.",
    },
    boards: {
      Edexcel: {
        paper: "Edexcel GCSE Business (1BS0): Paper 1 'Investigating small business' (Theme 1) and Paper 2 'Building a business' (Theme 2), 90 marks each. Paper 1: Section A 35 marks (Q1-3), Section B 30 marks (Q4-6), Section C 25 marks (Q7, ending with a 12-mark question). Each section is built on a different case-study business. Assessment objectives: AO1 knowledge, AO2 application to the business, AO3a analysis, AO3b evaluation/judgement.",
        sources: ["Edexcel 1BS0/01 mark scheme (Feb 2022)", "Edexcel 1BS0/02 mark scheme (Aug 2024)"],
      },
    },
  },
  {
    id: "english-language",
    subject: /\b(english( language)?|language)\b/i,
    notSubject: /literature|foreign|french|spanish|german|italian|latin|mandarin|chinese|greek/i,
    general: {
      style: "Reading questions ask about an unseen extract (identify information; language; structure; evaluation or comparison), then a writing task (letter, article, speech or story to a stated audience and purpose). Marked in levels: Level 4 'perceptive, detailed', Level 3 'clear, relevant', Level 2 'some, attempts', Level 1 'simple, limited'.",
      marking: "Mark the quality of the comments, not how many. Reward quotations that are really in the extract and an explanation of their effect on the reader, using subject terminology. Start at the lowest level and move up until the answer fits. An answer about the wrong lines or the wrong text is capped at a low level. Writing is marked for content and organisation (tone, register, structure, paragraphing, vocabulary) and separately for technical accuracy (sentence demarcation, punctuation range, Standard English, spelling).",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE English Language 8700, 80 marks per paper. Paper 1 (fiction): Q1 list four things from lines 1-6 (4 marks, AO1); Q2 language (8, AO2); Q3 structure (8, AO2); Q4 evaluate a statement about the text (20, AO4); Q5 creative writing, a description or a story (40: 24 content and organisation AO5 + 16 technical accuracy AO6). Paper 2 (non-fiction, two sources): Q1 choose four true statements (4, AO1); Q2 summarise the differences between the two sources (8, AO1); Q3 language analysis (12, AO2); Q4 compare the writers' perspectives (16, AO3); Q5 transactional writing such as a speech, letter or article giving a viewpoint (40: 24 + 16).",
        marking: "AQA bands: Q2/Q3 on Paper 1 (8 marks): L4 7-8, L3 5-6, L2 3-4, L1 1-2. Q4 (20): L4 16-20, L3 11-15, L2 6-10, L1 1-5. Paper 2 Q2 (8): both texts needed for Level 3 or above (one text max 3). Q3 (12): L4 10-12, L3 7-9, L2 4-6, L1 1-3. Q4 (16): L4 13-16, L3 9-12, L2 5-8, L1 1-4; one text only is capped at 6. Writing (24): L4 19-24, L3 13-18, L2 7-12, L1 1-6; technical accuracy (16): L4 13-16, L3 9-12, L2 5-8, L1 1-4. Four-point questions: 1 mark per valid point from the stated lines, a repeated point is credited once, copying lines word for word earns nothing.",
        sources: ["AQA 87001 mark scheme (June 2023)", "AQA 87002 mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "maths",
    subject: /\b(maths?|mathematics|statistics|algebra|geometry)\b/i,
    general: {
      style: "Short, multi-step calculation questions marked on method and answer. 'Show that' and problem-solving questions need every step written down. Probabilities are given as fractions, decimals or percentages. Papers are split into calculator and non-calculator.",
      marking: "Method marks (M) are for a correct or partly correct method, even if the final answer is wrong; accuracy marks (A) usually need the method mark; B marks are independent. Process marks (P) are for the steps of a problem-solving question and communication marks (C) for a clear, fully correct explanation. A correct answer from wrong working gets nothing. Where working is asked for, an answer alone earns no marks; otherwise a correct answer usually earns full marks. Follow-through (ft) credits a later answer that is correct from an earlier slip, if the working is shown. A 'show that' needs every step.",
    },
    boards: {
      Edexcel: {
        paper: "Edexcel GCSE Maths 1MA1: three papers (1: non-calculator, 2 and 3: calculator), 80 marks each, Foundation and Higher tiers. Questions usually run from short 1-2 mark items to multi-step problem-solving questions of 4-5 marks late in the paper. Marking codes: M method, P process, A accuracy, B independent mark, C communication, ft follow-through, oe or equivalent, cao correct answer only, isw ignore subsequent working, awrt answer rounding to.",
        sources: ["Edexcel 1MA1/1H mark scheme (Nov 2024)"],
      },
    },
  },
  {
    id: "science",
    subject: /\b(biology|chemistry|physics|(combined|triple|applied|natural|environmental|earth|forensic)?\s*science)\b/i,
    notSubject: /computer|computing|political|social|food/i,
    general: {
      style: "A mix of multiple choice, one-word and short answers, calculations with units, graph plotting, data interpretation, practical method questions, and a 6-mark extended answer marked in levels. Many questions are set around an unfamiliar situation (a data table, a graph, an experiment) and ask the student to apply what they know.",
      marking: "Mark schemes list acceptable alternatives. 'Any two from' means each bullet is a separate mark. '/' = alternative wording; 'allow' = also credit; 'ignore' = cannot earn the mark but does no harm; 'do not accept' = a wrong answer that blocks the mark even if the right one is also given. In a list, a right answer plus a wrong answer cancels the mark. Linked marks need a cause and its effect. 6-mark questions: Level 3 (5-6) = relevant points identified, detailed and logically linked into a clear account; Level 2 (3-4) = relevant points with attempts at linking, not fully clear; Level 1 (1-2) = points stated simply with no linking; best-fit the level first, then the mark. A statement that contradicts a correct one stops full marks.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Biology 8461: Paper 1 and Paper 2, 100 marks each (1 h 45), Foundation and Higher. Six questions per paper, each 13-21 marks, each built around one situation (for example plant tissues and medicines, the circulatory system and heart disease, immunity and microbiology, exercise and lactic acid, inheritance, a photosynthesis practical) and mixing multiple choice, naming, calculation, graph plotting, data interpretation, practical method design, evaluation of claims and a 6-mark extended answer.",
        sources: ["AQA 84611H mark scheme (June 2023)"],
      },
    },
  },
];

const text = (names) => names.map((n) => String(n ?? "")).filter((n) => n.trim()).join(" | ");

/** The guide entry for a subject (pass the subject name, then the topic as a fallback). */
export function findGuide(...names) {
  for (const n of names) {
    const t = String(n ?? "");
    if (!t.trim()) continue;
    for (const g of GUIDES) if (g.subject.test(t) && !(g.notSubject && g.notSubject.test(t))) return g;
  }
  return null;
}

/** What to tell the question maker: the layout of this subject's real papers (and the board's, when known). */
export function guideForQuestions(board, ...names) {
  const g = findGuide(...names);
  if (!g) return "";
  const b = (board && g.boards[board]) || null;
  const parts = [];
  if (b && b.paper) parts.push(`${board} paper layout: ${b.paper}`);
  parts.push(`How real ${names[0] || "exam"} questions are set: ${g.general.style}`);
  return parts.join("\n");
}

/** What to tell the marker: how real examiners mark this subject (and the board's bands, when known). */
export function guideForMarking(board, ...names) {
  const g = findGuide(...names);
  if (!g) return "";
  const b = (board && g.boards[board]) || null;
  return [g.general.marking, b && b.marking].filter(Boolean).join(" ");
}

/** Every paper and mark scheme the guides were read from, for the README and the app's credits. */
export const guideSources = () => GUIDES.flatMap((g) => Object.entries(g.boards).flatMap(([board, v]) => (v.sources || []).map((s) => `${g.id} / ${board}: ${s}`)));
