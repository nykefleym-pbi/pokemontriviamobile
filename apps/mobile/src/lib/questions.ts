import type { Trivia } from "@ptb/core/trivia";
import { supabase, hasSupabaseConfig } from "./supabase";

/** What the server is willing to tell the client about a question.
 *
 *  Note what is NOT here: `correct`. `curated_questions` has RLS enabled with
 *  no policies at all, and `get_trivia_questions` projects the answer key away,
 *  so the client structurally cannot know which option is right. That is the
 *  whole design — see docs/HANDOVER.md. It is also why this module exposes a
 *  `gradeAnswer` that asks the server, rather than a comparison. */
export interface ServedQuestion {
  id: string;
  question: string;
  options: string[];
  category: string;
  difficulty: string;
  type_theme: string | null;
}

/** Offline last resort, and what the app plays with until anonymous sign-in is
 *  enabled (the RPCs are granted to `authenticated`, not `anon`). These carry
 *  their own answers because there is no server in the loop to ask. */
export const FALLBACK_QUESTIONS: Trivia[] = [
  {
    question: "Which type is super effective against Water?",
    options: ["Fire", "Electric", "Rock", "Flying"],
    correct: 1,
    explanation: "Electric and Grass both hit Water for double damage.",
    category: "types",
  },
  {
    question: "What is Pikachu's National Pokédex number?",
    options: ["25", "26", "24", "27"],
    correct: 0,
    explanation: "Pikachu is #25; Raichu is #26.",
    category: "pokedex",
  },
  {
    question: "Which of these is NOT a starter Pokémon?",
    options: ["Bulbasaur", "Charmander", "Squirtle", "Caterpie"],
    correct: 3,
    explanation: "Caterpie is an early-route Bug type, not a starter.",
    category: "pokedex",
  },
  {
    question: "Ghost-type moves have no effect on which type?",
    options: ["Psychic", "Normal", "Dark", "Fighting"],
    correct: 1,
    explanation: "Normal is immune to Ghost, and Ghost is immune to Normal.",
    category: "types",
  },
  {
    question: "Which Pokémon evolves into Gyarados?",
    options: ["Magikarp", "Feebas", "Goldeen", "Horsea"],
    correct: 0,
    explanation: "Magikarp evolves into Gyarados at level 20.",
    category: "evolution",
  },
  {
    question: "How many types exist in the modern games?",
    options: ["15", "17", "18", "20"],
    correct: 2,
    explanation: "Eighteen, since Fairy was added in Generation VI.",
    category: "types",
  },
];

export interface QuestionSet {
  /** Display-ready questions. */
  served: ServedQuestion[];
  /** True when these came from the server and grading must go back to it. */
  fromServer: boolean;
  /** Present only for the bundled set, which carries its own answers. */
  local: Trivia[] | null;
}

export async function loadQuestions(count: number): Promise<QuestionSet> {
  if (hasSupabaseConfig) {
    try {
      const { data, error } = await supabase.rpc("get_trivia_questions", {
        _count: count,
        _difficulty: null,
        _type_theme: null,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return { served: data as ServedQuestion[], fromServer: true, local: null };
      }
    } catch {
      // fall through to the bundled set
    }
  }
  const local = FALLBACK_QUESTIONS.slice(0, count);
  return {
    served: local.map((q, i) => ({
      id: `local-${i}`,
      question: q.question,
      options: q.options,
      category: q.category,
      difficulty: "easy",
      type_theme: null,
    })),
    fromServer: false,
    local,
  };
}

export interface Grade {
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

/** Grading is a server call when the questions came from the server, because
 *  only the server knows the answer. The bundled set is graded locally since
 *  it ships its own key and there is nothing to protect. */
export async function gradeAnswer(
  set: QuestionSet,
  index: number,
  choice: number,
): Promise<Grade> {
  if (!set.fromServer && set.local) {
    const q = set.local[index];
    return {
      correct: choice === q.correct,
      correctIndex: q.correct,
      explanation: q.explanation,
    };
  }
  const { data, error } = await supabase.rpc("grade_trivia_answer", {
    _question_id: set.served[index].id,
    _choice: choice,
  });
  if (error || !data) throw new Error(error?.message ?? "grading failed");
  const g = data as { correct: boolean; correct_index: number; explanation: string };
  return { correct: g.correct, correctIndex: g.correct_index, explanation: g.explanation };
}
