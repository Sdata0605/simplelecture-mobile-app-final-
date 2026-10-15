import { TeacherSubject } from './aiTeacherService';

export const KNOWN_EXTERNAL_SUBJECTS: { name: string; pattern: RegExp }[] = [
  {
    name: 'Computer Fundamentals',
    pattern: /\b(computer fundamentals?|computer science|basics of computer|input and output devices|operating systems?|cpu|ram|rom)\b/i,
  },
  {
    name: 'Python',
    pattern: /\b(python|python3|django|flask|pandas|numpy|pip)\b/i,
  },
  {
    name: 'Java',
    pattern: /\b(java|spring boot|jvm|j2ee|jdk)\b/i,
  },
  {
    name: 'C / C++',
    pattern: /\b(c\+\+|cpp|c programming|pointers in c)\b/i,
  },
  {
    name: 'Machine Learning & AI',
    pattern: /\b(machine learning|deep learning|neural networks?|nlp|artificial intelligence|data science)\b/i,
  },
  {
    name: 'Web Development',
    pattern: /\b(web development|html|css|javascript|react|node\.?js|frontend|backend)\b/i,
  },
  {
    name: 'Coding & Programming',
    pattern: /\b(coding|programming|data structures?|algorithms?|leetcode)\b/i,
  },
  {
    name: 'Cloud Computing & DevOps',
    pattern: /\b(cloud computing|aws|azure|devops|docker|kubernetes)\b/i,
  },
  {
    name: 'Cybersecurity',
    pattern: /\b(cybersecurity|ethical hacking|cryptography|penetration testing)\b/i,
  },
  {
    name: 'Blockchain',
    pattern: /\b(blockchain|cryptocurrency|bitcoin|ethereum|solidity)\b/i,
  },
  {
    name: 'Accountancy & Commerce',
    pattern: /\b(accountancy|accounting|balance sheet|ledger|double entry)\b/i,
  },
  {
    name: 'Business Studies',
    pattern: /\b(business studies|business management|marketing management)\b/i,
  },
];

/**
 * Detects if a student's query is asking about a subject outside their enrolled syllabus.
 */
export function detectOutOfSyllabusTopic(
  query: string,
  enrolled: TeacherSubject[],
  allCatalogSubjects: TeacherSubject[] = []
): { detectedSubject: string } | null {
  for (const item of KNOWN_EXTERNAL_SUBJECTS) {
    if (item.pattern.test(query)) {
      const isEnrolled = enrolled.some(
        (s) =>
          s.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(s.name.toLowerCase())
      );
      if (!isEnrolled) {
        return { detectedSubject: item.name };
      }
    }
  }

  for (const catSub of allCatalogSubjects) {
    const isEnrolled = enrolled.some(
      (s) => s.id === catSub.id || s.name.toLowerCase() === catSub.name.toLowerCase()
    );
    if (!isEnrolled) {
      const escaped = catSub.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      if (pattern.test(query)) {
        return { detectedSubject: catSub.name };
      }
    }
  }

  return null;
}

/**
 * Formats the polite refusal message for out-of-syllabus topics.
 */
export function formatOutOfSyllabusRefusal(
  enrolledSubjectNames: string,
  detectedSubject: string
): string {
  return `I am your personal AI tutor for your enrolled syllabus (${enrolledSubjectNames}). I cannot answer questions about external topics like ${detectedSubject}. Which of your enrolled subjects would you like to study?`;
}

/**
 * Conversationally matches a mentioned subject name from a student's message.
 */
export function findMentionedSubject(
  text: string,
  availableSubjects: TeacherSubject[]
): TeacherSubject | null {
  const q = text.toLowerCase();

  // 1. Social Science takes precedence over pure Science if 'social' or 'sst' is in the query
  const socialSubject = availableSubjects.find((s) => s.name.toLowerCase().includes('social'));
  if (socialSubject && /\b(social|social science|sst|history|geography|civics)\b/i.test(q)) {
    return socialSubject;
  }

  // 2. Sort by name length descending so more specific subject names match first
  const sorted = [...availableSubjects].sort((a, b) => b.name.length - a.name.length);

  for (const s of sorted) {
    const name = s.name.toLowerCase();
    if (name.includes('social')) continue;

    if (name.includes('math') && /\b(math|maths|mathematics)\b/i.test(q)) return s;
    if (name.includes('science') && /\b(science|sci|physics|chemistry|biology)\b/i.test(q)) {
      if (!/\bsocial\b/i.test(q)) {
        return s;
      }
    }
    if (name.includes('english') && /\b(english|eng)\b/i.test(q)) return s;
    if (name.includes('kannada') && /\b(kannada|kan)\b/i.test(q)) return s;
    if (name.includes('hindi') && /\b(hindi|hin)\b/i.test(q)) return s;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(q)) return s;
  }
  return null;
}

/**
 * Determines if a query is purely selecting/asking to study a subject.
 */
export function isSubjectOnlyQuery(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 35) return true;
  return /^(let'?s (study|learn|start)|i want to study|teach me|start|subject is|can we (study|learn))\s+/i.test(trimmed);
}

/**
 * Computes whether BYOK mode should be used (Pro Plan with custom key or Plus Plan).
 * If user set apiMode === 'admin', uses admin managed key.
 * If user set apiMode === 'own', uses their personal key.
 */
export function computeUseByok(
  isPlan500: boolean,
  isPlan1000: boolean,
  apiKey?: string | null,
  apiMode?: 'admin' | 'own'
): boolean {
  if (isPlan500) return true;
  if (apiMode === 'admin') return false;
  if (apiMode === 'own') return !!apiKey?.trim();
  return isPlan1000 && !!apiKey?.trim();
}
