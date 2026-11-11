// Exam guides: how real UK exam papers are laid out and marked, per subject and exam board.
// Everything here is paraphrased from the exam boards' own published mark schemes and papers (no questions are copied),
// and is fed to the question maker (so questions look like the real thing) and to the marker (so it marks the way examiners do).
// To add a subject: add an entry to GUIDES. `sources` lists the papers it was read from. Boards use the names in logic.js BOARDS.

const SCI = {
    general: {
      style: "A mix of multiple choice, one-word and short answers, calculations with units, graph plotting, data interpretation, practical method questions, and a 6-mark extended answer marked in levels. Many questions are set around an unfamiliar situation (a data table, a graph, an experiment) and ask the student to apply what they know.",
      marking: "Mark schemes list acceptable alternatives. 'Any two from' means each bullet is a separate mark. '/' = alternative wording; 'allow' = also credit; 'ignore' = cannot earn the mark but does no harm; 'do not accept' = a wrong answer that blocks the mark even if the right one is also given. In a list, a right answer plus a wrong answer cancels the mark. Linked marks need a cause and its effect. 6-mark questions: Level 3 (5-6) = relevant points identified, detailed and logically linked into a clear account; Level 2 (3-4) = relevant points with attempts at linking, not fully clear; Level 1 (1-2) = points stated simply with no linking; best-fit the level first, then the mark. A statement that contradicts a correct one stops full marks.",
    },
};

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
    id: "biology",
    subject: /\bbiology\b/i,
    ...SCI,
    boards: {
      AQA: {
        paper: "AQA GCSE Biology 8461: Paper 1 and Paper 2, 100 marks each (1 h 45), Foundation and Higher. Six questions per paper, each 13-21 marks, each built around one situation (for example plant tissues and medicines, the circulatory system and heart disease, immunity and microbiology, exercise and lactic acid, inheritance, a photosynthesis practical) and mixing multiple choice, naming, calculation, graph plotting, data interpretation, practical method design, evaluation of claims and a 6-mark extended answer.",
        sources: ["AQA 84611H mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "chemistry",
    subject: /\bchemistry\b/i,
    general: {
      style: SCI.general.style + " Chemistry adds balanced equations, formulae, calculations (moles, concentrations, yield), dot-and-cross diagrams, and 'method' questions such as making a salt.",
      marking: SCI.general.marking + " Calculations earn a mark for each correct stage, error carried forward within a part, and a correct answer from wrong working does not get full marks. Give the right formula when asked for one; a name or a symbol can both be creditworthy if they fit. Do not call intermolecular forces covalent bonds. A method question (such as making a salt) is level-marked: Level 3 (5-6) = a method that would work, with the key steps logically sequenced; Level 2 (3-4) = most steps but not fully sequenced; Level 1 (1-2) = some relevant steps with unclear links.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Chemistry 8462: Paper 1 Higher (June 2023) = 10 questions of 8-12 marks, 100 marks, mixing short answers, calculations, graph plotting and drawing, practical evaluation, labelled diagrams and one 6-mark extended answer (a method) plus a 4-mark judgement question (choose a metal and justify with several reasons).",
        sources: ["AQA 84621H mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "physics",
    subject: /\bphysics\b/i,
    general: {
      style: SCI.general.style + " Physics adds equations (state it, substitute, rearrange, answer with a unit), unit conversions (kW to W, cm to m) and standard form.",
      marking: SCI.general.marking + " Calculations: marks for the equation or substitution, any rearrangement, and the final answer; students can skip steps if a later step is right; error carried forward is allowed; units are expected on the final answer and values must be converted before substituting. 6-mark questions: three levels worth two marks each (5-6, 3-4, 1-2); indicative content is a guide and other valid points earn credit. Explanations need the physical reason (e.g. both are positively charged, so they repel) and not just the observation.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Physics 8463: Paper 1 Higher (June 2023), 100 marks over nine questions mixing short answers, multi-step calculations and two 6-mark extended answers.",
        sources: ["AQA 84631H mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "science",
    subject: /\b((combined|triple|applied|natural|environmental|earth|forensic)\s+science|science)\b/i,
    notSubject: /computer|computing|political|social|food/i,
    ...SCI,
    boards: {},
  },
  {
    id: "history",
    subject: /\bhistory\b/i,
    general: {
      style: "Source and knowledge questions marked in levels. Typical mark values: 4 marks (e.g. say what two interpretations differ on, or give two problems/consequences, each with support), 8 marks (explain why an interpretation is more convincing, or explain/write about the effects of an event), 12 marks (a 'which was more important' or 'how far do you agree' judgement). Questions name the period and key words to focus on.",
      marking: "Examiners find the best-fit level, then the mark within it. Higher levels need accurate, detailed own knowledge, a developed explanation of cause, consequence or change, and (for 8- and 12-mark evaluative questions) a sustained judgement that is supported, not just stated. Indicative content is a guide, not a model answer: other valid points are credited. Interpretation questions reward using the content and the provenance (who, when, why) of the interpretations with own knowledge.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE History 8145 (one option per paper): Paper 1 Section A (period study) Q1 differences between two interpretations (4 marks), Q2 why the authors' views differ (4), Q3 which interpretation is more convincing (8); Section B Q4 two problems/features (4), Q5 explain the effect of an event (8), Q6 which of two factors saw more important change (12). Marks come from AO1 knowledge, AO2 explanation, AO4 interpretations.",
        sources: ["AQA 81451AC mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "geography",
    subject: /\bgeograph/i,
    general: {
      style: "Short point-marked items (1-2 marks, a point and a developed point) and level-marked questions of 4, 6 and 9 marks. Questions often use a figure, map or data table. Command words: describe = give features or pattern; outline = main points briefly; explain = a reasoned account of how or why; suggest = propose likely causes or effects using the evidence; assess / evaluate / 'to what extent' = weigh evidence and reach a judgement. Named places, case studies and data support answers.",
      marking: "Point marking: 1 mark for the point and often a second for a developed idea. Level marking (4 marks: L2 3-4, L1 1-2; 6 marks: L3 5-6, L2 3-4, L1 1-2; 9 marks: L3 7-9, L2 4-6, L1 1-3): AO1 knowledge, AO2 understanding of processes and links, AO3 applying evidence from the figures and judging. Examiners find the best-fit level then the mark within it. Answers that ignore the figure, or give no evaluation where one is asked for, are capped at Level 2. Named places and data are credited when relevant to the question. Some 9-mark questions carry 3 extra marks for spelling, punctuation and grammar.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Geography 8035 Paper 1 'Living with the physical environment': sections A, B and C (natural hazards, the living world, physical landscapes in the UK), questions of 1, 2, 4, 6 and 9 marks (9-mark questions include 3 SPaG marks).",
        sources: ["AQA 80351 mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "english-literature",
    subject: /\bliterature\b/i,
    general: {
      style: "Essay questions on a set text. Each starts from a short extract and asks how the writer presents an idea or character, then asks you to write about the extract and the whole text. Marked in six levels: L6 'critical, exploratory'; L5 'thoughtful, developed'; L4 'clear understanding'; L3 'explained, structured comments'; L2 'supported, relevant comments'; L1 'simple, explicit comments'.",
      marking: "Any valid interpretation is credited; there is no single set of points. Credit specific references (short quotations), apt subject terminology, explored effects of the writer's methods, and links between the text, its context and the task. Weighting on a 30-mark question: AO1 (response and quotations) 12, AO2 (language, form, structure) 12, AO3 (context) 6; Shakespeare adds 4 marks for spelling, punctuation and grammar. A response that ignores the extract or the whole text is capped near the top of Level 2.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE English Literature 8702 Paper 1 'Shakespeare and the 19th-century novel': Section A Shakespeare 30 + 4 SPaG marks, Section B the novel 30 marks; wording like 'Starting with this extract, explore how... Write about how... in this extract and in the play as a whole'. Level bands out of 30: L6 26-30, L5 21-25, L4 16-20, L3 11-15, L2 6-10, L1 1-5.",
        sources: ["AQA 87021 mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "computer-science",
    subject: /\b(computer science|computing)\b/i,
    general: {
      style: "Mostly short point-marked questions (state, describe, give, convert, complete), binary and hexadecimal conversion, binary addition and shifts, labelling, and an 8-mark extended 'discuss' question on an issue such as ethics, environment, legal or cultural impact, with benefits and drawbacks for different groups.",
      marking: "Point marking: 1 mark per valid point up to a stated maximum. 'Accept' lists valid alternatives; 'do not accept' earns nothing; a named product on its own is not accepted when a description is asked for. Two answers to a single-answer question, or contradictory answers, earn no mark. Binary and shift questions are marked on the final answer and the working shown. The 8-mark discuss question is level-marked: low (1-2), middle (3-5), high (6-8); credit knowledge, application to the scenario, balance of benefits and drawbacks, and a structured, evaluative response.",
    },
    boards: {
      OCR: {
        paper: "OCR GCSE Computer Science J277 Paper 1 'Computer systems', about 80 marks over six questions with lettered parts (hardware, memory and storage, networks, security, software, ethics and the impacts of technology); Paper 2 covers computational thinking, algorithms and programming.",
        sources: ["OCR J277/01 mark scheme (June 2025)"],
      },
    },
  },
  {
    id: "religious-studies",
    subject: /\b(religious|theology|philosophy|ethics)\b/i,
    general: {
      style: "Belief and teachings questions. Typical stems: 1 mark = multiple choice; 2 marks = 'Give two...'; 4 marks = 'Explain two beliefs / contrasting beliefs...' (each worth 1 mark for a simple explanation or 2 for a developed one, and it must refer to a religious tradition); 5 marks = 'Explain two reasons/beliefs... and refer to a source of wisdom and authority' (the source reference is worth 1 mark); 12 marks (+3 for spelling, punctuation and grammar) = 'Evaluate this statement': reasoned arguments for and against, religious arguments, and a justified conclusion.",
      marking: "'Give two': one mark per correct point and only the first two are marked. 'Explain two': 1 mark for a simple explanation or 2 for a detailed one, for each belief. For the 12-mark answer: Level 4 (10-12) = a well-argued response with reasoned consideration of different views, logical chains of reasoning leading to a judgement, and religion applied to the issue; Level 3 (7-9) = reasoned consideration of different views with clear reference to religion; Level 2 (4-6) = reasoned consideration of one view, or different views each supported, and capped at Level 2 if there is no reference to religion; Level 1 (1-3) = a point of view with reasons stated. Best-fit the level first, then the mark. SPaG (3 marks): high accuracy and a wide range of specialist terms = 3, considerable = 2, reasonable = 1.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Religious Studies A 8062: two papers (beliefs and teachings of two religions, then themes such as relationships, life issues, peace and conflict and crime and punishment), each question split into parts worth 1, 2, 4, 5 and 12 marks; the 12-mark part also carries 3 SPaG marks.",
        sources: ["AQA 80622A mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "psychology",
    subject: /\bpsychology\b/i,
    general: {
      style: "Short and medium items on memory, perception, development, research methods and other topic areas, with some set around a short scenario. Mark values 1-6 and 9: 1 mark multiple choice or short calculation; 2 marks definitions, explanations, conclusions; 3 marks describe/explain; 4-5 marks evaluate or explain a concept; 6 marks design a study (component points); 9 marks 'describe and evaluate' a theory or study.",
      marking: "A 2-mark outline gives 2 for a clear and accurate response and 1 for a limited or muddled one; some questions give 1 mark for a correct statement and 1 for the explanation. 4-, 5- and 9-mark answers are level-marked. A 6-mark 'design a study' question is marked by components (the task and data, the independent variable, and an extraneous variable with how it is controlled, up to 2 each), not by levels. Credit accurate key terminology, accurate detail of studies, application to the scenario, and evaluation with a supported conclusion; other valid content is credited.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Psychology 8182: Paper 1 (cognition and behaviour: memory, perception, development, research methods) and Paper 2 (social context and behaviour: social influence, language, brain and neuropsychology, psychological problems); 100 marks each, a mix of multiple-choice, short, calculation, design and 9-mark describe-and-evaluate questions.",
        sources: ["AQA 81821 mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "sociology",
    subject: /\bsociology\b/i,
    general: {
      style: "Questions on families and education (Paper 1) and crime and deviance and social stratification (Paper 2), some built on short 'Items' (an extract about a study or statistic). 1 mark = terms/multiple choice; 2 marks = a strength or weakness of a method from an Item; 3 marks = describe or identify; 4 marks = explain a point in context; 12 marks = 'Discuss how far sociologists would agree that...' with theories and studies.",
      marking: "Credit relevant sociological theories, concepts, studies and methods, application to the Item or context, and evaluation with a judgement. 2-mark evaluation: each mark needs analysis plus a judgement. 4-mark items: 1 mark for identifying a point and 3 for explaining it in context (levelled). 12 marks are split equally between knowledge, application and evaluation, with four levels and best fit. If a student gives more responses than asked for, mark all but credit only the best one.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Sociology 8192: Paper 1 'The sociology of families and education' (100 marks, Section A families, Section B education) and Paper 2 'The sociology of crime and deviance and social stratification'.",
        sources: ["AQA 81921 mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "languages",
    subject: /\b(french|spanish|german|italian|modern foreign|languages?)\b/i,
    notSubject: /english|latin|greek|computer|programming|mandarin|chinese/i,
    general: {
      style: "Reading comprehension of short texts: true/false/not mentioned, positive/negative opinion, multiple choice letters, short answers in English, short answers in the target language, putting words in the right order, and a translation from the target language into English marked in short chunks.",
      marking: "Comprehension answers earn marks for the key idea(s); two-mark questions need two ideas. Alternative wording with the same meaning is accepted; answers that are too vague or contradict the key idea are not. Extra information is accepted unless it contradicts the key idea. Where a list is asked for, only the first items are marked. Translation is marked chunk by chunk, one mark per chunk, with a wrong tense or a mistranslation that changes the meaning not credited. In target-language answers spelling, gender, pronoun and minor tense errors are tolerated if the meaning is clear.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE modern languages (checked on French 8658 Reading Higher): about 60 marks over 12 questions, including opinions, multiple choice, English and target-language answers, word reordering (5 marks) and a French-to-English translation of about 8 chunks. The same four-skill layout (listening, speaking, reading, writing) applies in Spanish and German.",
        sources: ["AQA 8658RH mark scheme (June 2023)"],
      },
    },
  },
  {
    id: "pe",
    subject: /\b(pe|p\.e\.|physical education|sport science)\b/i,
    general: {
      style: "Applied anatomy and physiology, physical training, and socio-cultural issues. Short items (1-4 marks) ask for a definition, an explanation, or a sporting example; 6 marks = an extended answer on a training topic (such as agility and flexibility) and 9 marks = a level-marked answer applying training principles to a sporting scenario.",
      marking: "Short items: a mark per valid point up to the stated maximum, often a definition plus an example. Examples count only if they fit the sport and the action in the question. A wrong test or term name means no marks for its description. Extended answers: Level 3 accurate, well-detailed and analytical; Level 2 more detail for one part of the question; Level 1 limited, with poorly focused or absent application. Best-fit the level first, then the mark. Credit accurate sporting examples, correct terminology and reasoned judgements; students need not cover every indicative point for full marks.",
    },
    boards: {
      AQA: {
        paper: "AQA GCSE Physical Education 8582: Paper 1 'The human body and movement in physical activity and sport' (78 marks: 1-9 mark questions, AO1 33, AO2 26, AO3 19) and Paper 2 'Socio-cultural influences and well-being in physical activity and sport'.",
        sources: ["AQA 85821 mark scheme (June 2023)"],
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
