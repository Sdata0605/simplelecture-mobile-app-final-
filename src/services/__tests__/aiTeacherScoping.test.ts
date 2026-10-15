import {
  detectOutOfSyllabusTopic,
  findMentionedSubject,
  isSubjectOnlyQuery,
  formatOutOfSyllabusRefusal,
  computeUseByok,
  KNOWN_EXTERNAL_SUBJECTS,
} from '../aiTeacherScoping';
import { TeacherSubject } from '../aiTeacherService';

describe('AI Teacher Enrolled Courses Scoping & Conversational Subject Selection', () => {
  const standardEnrolledSubjects: TeacherSubject[] = [
    { id: 'mathematics', name: 'Mathematics', topics: 15 },
    { id: 'science', name: 'Science', topics: 16 },
    { id: 'social_science', name: 'Social Science', topics: 20 },
    { id: 'english', name: 'English', topics: 12 },
    { id: 'kannada', name: 'Kannada', topics: 14 },
  ];

  describe('detectOutOfSyllabusTopic', () => {
    it('detects Computer Fundamentals as out-of-syllabus when not enrolled', () => {
      const match = detectOutOfSyllabusTopic(
        'Can you explain computer fundamentals?',
        standardEnrolledSubjects
      );
      expect(match).not.toBeNull();
      expect(match?.detectedSubject).toBe('Computer Fundamentals');
    });

    it('detects Python as out-of-syllabus when not enrolled', () => {
      const match = detectOutOfSyllabusTopic(
        'Please teach me Python programming and django',
        standardEnrolledSubjects
      );
      expect(match).not.toBeNull();
      expect(match?.detectedSubject).toBe('Python');
    });

    it('detects Java, C++, and Web Development as external topics', () => {
      expect(
        detectOutOfSyllabusTopic('Explain Java JVM', standardEnrolledSubjects)?.detectedSubject
      ).toBe('Java');

      expect(
        detectOutOfSyllabusTopic('Pointers in C++', standardEnrolledSubjects)?.detectedSubject
      ).toBe('C / C++');

      expect(
        detectOutOfSyllabusTopic('How to build websites using HTML CSS and Javascript?', standardEnrolledSubjects)
          ?.detectedSubject
      ).toBe('Web Development');
    });

    it('allows questions on enrolled subjects without triggering out-of-syllabus', () => {
      expect(
        detectOutOfSyllabusTopic('Explain quadratic equations in Mathematics', standardEnrolledSubjects)
      ).toBeNull();

      expect(
        detectOutOfSyllabusTopic('What is photosynthesis in plants?', standardEnrolledSubjects)
      ).toBeNull();

      expect(
        detectOutOfSyllabusTopic('Tell me about Indian Constitution and rights', standardEnrolledSubjects)
      ).toBeNull();
    });

    it('allows external topics if the student has actually enrolled in them', () => {
      const studentWithCS: TeacherSubject[] = [
        ...standardEnrolledSubjects,
        { id: 'cs', name: 'Computer Fundamentals', topics: 10 },
      ];
      expect(
        detectOutOfSyllabusTopic('Explain computer fundamentals basics', studentWithCS)
      ).toBeNull();
    });

    it('formats the exact required refusal message', () => {
      const match = detectOutOfSyllabusTopic('Teach me Python', standardEnrolledSubjects);
      const enrolledSubjectNames = standardEnrolledSubjects.map((s) => s.name).join(', ');
      const refusal = formatOutOfSyllabusRefusal(enrolledSubjectNames, match?.detectedSubject || '');

      expect(refusal).toBe(
        'I am your personal AI tutor for your enrolled syllabus (Mathematics, Science, Social Science, English, Kannada). I cannot answer questions about external topics like Python. Which of your enrolled subjects would you like to study?'
      );
    });
  });

  describe('findMentionedSubject', () => {
    it('matches exact and colloquial subject names', () => {
      expect(findMentionedSubject('I want to study Mathematics', standardEnrolledSubjects)?.name).toBe(
        'Mathematics'
      );
      expect(findMentionedSubject('Can we study maths today?', standardEnrolledSubjects)?.name).toBe(
        'Mathematics'
      );
      expect(findMentionedSubject('Let us study Science', standardEnrolledSubjects)?.name).toBe(
        'Science'
      );
      expect(findMentionedSubject('Teach me English', standardEnrolledSubjects)?.name).toBe(
        'English'
      );
      expect(findMentionedSubject('I want to learn Kannada', standardEnrolledSubjects)?.name).toBe(
        'Kannada'
      );
      expect(findMentionedSubject('Social Science chapter 1', standardEnrolledSubjects)?.name).toBe(
        'Social Science'
      );
    });

    it('returns null when no subject is mentioned', () => {
      expect(findMentionedSubject('Hello how are you?', standardEnrolledSubjects)).toBeNull();
      expect(findMentionedSubject('What is the meaning of life?', standardEnrolledSubjects)).toBeNull();
    });
  });

  describe('isSubjectOnlyQuery', () => {
    it('identifies short subject selection queries', () => {
      expect(isSubjectOnlyQuery('Mathematics')).toBe(true);
      expect(isSubjectOnlyQuery('Science')).toBe(true);
      expect(isSubjectOnlyQuery("Let's study Science")).toBe(true);
      expect(isSubjectOnlyQuery('I want to study English')).toBe(true);
    });

    it('distinguishes long detailed questions from subject-only selection', () => {
      expect(
        isSubjectOnlyQuery(
          'Can you explain the detailed steps to solve the quadratic equation 3x^2 + 5x - 2 = 0?'
        )
      ).toBe(false);
    });
  });

  describe('Pro Plan custom API key BYOK flag logic', () => {
    it('enables BYOK mode for Pro Plan users who have entered a custom Gemini key', () => {
      const useByok = computeUseByok(false, true, 'AIzaSyDemoKey12345');
      expect(useByok).toBe(true);
    });

    it('uses Admin server token (useByok = false) for Pro Plan users without a key', () => {
      const useByok = computeUseByok(false, true, '');
      expect(useByok).toBe(false);
    });

    it('always enables BYOK mode for Plus Plan users (isPlan500)', () => {
      expect(computeUseByok(true, false, '')).toBe(true);
      expect(computeUseByok(true, false, 'AIzaSyDemoKey12345')).toBe(true);
    });
  });
});
