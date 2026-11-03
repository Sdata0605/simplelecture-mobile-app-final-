import {
  getSubjects,
  getOutline,
  sendChatMessage,
  TeacherApiError,
} from '../aiTeacherService';
import { DEFAULT_PREFS } from '../aiTeacherPrefs';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  })),
}));

describe('aiTeacherService', () => {
  beforeEach(() => {
    (global as any).__fetchImpl = async () => {
      throw new Error('fetch not programmed for this test');
    };
  });

  describe('TeacherApiError', () => {
    it('creates an instance of Error with correct properties', () => {
      const err = new TeacherApiError('Custom error message', 404);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('TeacherApiError');
      expect(err.message).toBe('Custom error message');
      expect(err.status).toBe(404);
    });
  });

  describe('getSubjects', () => {
    it('fetches subject list via ai-teacher edge function', async () => {
      const mockSubjects = [
        { id: 'maths_10', name: 'Mathematics', topics: 45 },
        { id: 'science_10', name: 'Science', topics: 52 },
      ];

      (global as any).__fetchImpl = async (url: string, init: any) => {
        expect(url).toContain('/functions/v1/ai-teacher');
        const body = JSON.parse(init.body);
        expect(body.action).toBe('subjects');
        return {
          ok: true,
          status: 200,
          json: async () => ({ subjects: mockSubjects }),
        };
      };

      const result = await getSubjects();
      expect(result.subjects).toEqual(mockSubjects);
    });

    it('throws TeacherApiError if edge function returns an error status', async () => {
      (global as any).__fetchImpl = async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database query failed' }),
        };
      };

      await expect(getSubjects()).rejects.toThrow('Database query failed');
    });
  });

  describe('getOutline', () => {
    it('fetches chapter and topic outline for a given subject', async () => {
      const mockChapters = [
        {
          id: 'ch-1',
          number: 1,
          title: 'Arithmetic Progressions',
          topics: [{ id: 'top-1', label: '1.1', title: 'Introduction' }],
        },
      ];

      (global as any).__fetchImpl = async (url: string, init: any) => {
        const body = JSON.parse(init.body);
        expect(body.action).toBe('outline');
        expect(body.subjectId).toBe('maths_10');
        return {
          ok: true,
          status: 200,
          json: async () => ({ chapters: mockChapters }),
        };
      };

      const result = await getOutline('maths_10');
      expect(result.chapters).toEqual(mockChapters);
    });
  });

  describe('sendChatMessage', () => {
    it('routes managed ₹1000 plan through the backend edge function', async () => {
      const mockAnswer = 'Photosynthesis is the process by which green plants make food.';

      (global as any).__fetchImpl = async (url: string, init: any) => {
        const body = JSON.parse(init.body);
        expect(body.action).toBe('chat');
        expect(body.subjectId).toBe('science_10');
        expect(body.question).toBe('What is photosynthesis?');
        expect(body.persona).toBeDefined();
        expect(body.byok).toBeUndefined();

        return {
          ok: true,
          status: 200,
          json: async () => ({
            found: true,
            topics: [],
            answer: mockAnswer,
          }),
        };
      };

      const res = await sendChatMessage({
        subjectId: 'science_10',
        question: 'What is photosynthesis?',
        prefs: DEFAULT_PREFS,
      });

      expect(res.found).toBe(true);
      expect(res.answer).toBe(mockAnswer);
    });
  });
});
