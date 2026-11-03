// Tests for the reminder_audio push helpers. Spec: _scratch/reminders-v2-plan.md (audio push).
// Native modules are mocked: the test runs in the node environment without a React Native runtime.

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(async () => []),
}));
jest.mock('../../supabase', () => ({ SUPABASE_URL: 'https://abcdwxyz.supabase.co' }));
jest.mock('../audio', () => ({
  downloadReminderAudio: jest.fn(async () => 'file:///doc/reminders-audio/x.wav'),
  gcAudio: jest.fn(async () => {}),
}));

import { downloadReminderAudio, gcAudio } from '../audio';
import {
  buildReminderAudioPayload,
  handleReminderAudioPush,
  isAllowedAudioUrl,
  isValidAudioHash,
  type ReminderAudioPushItem,
} from '../audioPush';

const download = downloadReminderAudio as unknown as jest.Mock;
const gc = gcAudio as unknown as jest.Mock;

const GOOD_HASH = 'abcdef0123456789';
const GOOD_URL = 'https://abcdwxyz.supabase.co/storage/v1/object/sign/reminders-audio/x.wav?token=t';

beforeEach(() => {
  download.mockClear();
  download.mockImplementation(async () => 'file:///doc/reminders-audio/x.wav');
  gc.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isValidAudioHash', () => {
  it('accepts hex digests from 16 to 128 characters', () => {
    expect(isValidAudioHash(GOOD_HASH)).toBe(true);
    expect(isValidAudioHash('ABCDEF0123456789abcdef')).toBe(true);
    expect(isValidAudioHash('a'.repeat(128))).toBe(true);
  });

  it('rejects short, long, non-hex and path-like values', () => {
    expect(isValidAudioHash('a'.repeat(15))).toBe(false);
    expect(isValidAudioHash('a'.repeat(129))).toBe(false);
    expect(isValidAudioHash('abcdef012345678x')).toBe(false);
    expect(isValidAudioHash('../../etc/passwd0000')).toBe(false);
    expect(isValidAudioHash('')).toBe(false);
    expect(isValidAudioHash(undefined)).toBe(false);
  });
});

describe('isAllowedAudioUrl', () => {
  it('accepts https on the Supabase host', () => {
    expect(isAllowedAudioUrl(GOOD_URL)).toBe(true);
  });

  it('rejects http on the Supabase host', () => {
    expect(isAllowedAudioUrl('http://abcdwxyz.supabase.co/storage/v1/x.wav')).toBe(false);
  });

  it('rejects other hosts, including look-alike hosts', () => {
    expect(isAllowedAudioUrl('https://evil.example.com/x.wav')).toBe(false);
    expect(isAllowedAudioUrl('https://abcdwxyz.supabase.co.evil.com/x.wav')).toBe(false);
    expect(isAllowedAudioUrl('https://abcdwxyz.supabase.co@evil.com/x.wav')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isAllowedAudioUrl(42)).toBe(false);
    expect(isAllowedAudioUrl(null)).toBe(false);
  });
});

describe('buildReminderAudioPayload', () => {
  it('wraps the items as a JSON string under the reminder_audio type', () => {
    const items: ReminderAudioPushItem[] = [
      { hash: GOOD_HASH, fmt: 'wav', url: GOOD_URL, fireAt: '2030-01-01T10:00:00.000Z' },
    ];
    const payload = buildReminderAudioPayload(items);
    expect(payload).toEqual({ type: 'reminder_audio', items: JSON.stringify(items) });
    expect(JSON.parse(payload.items)).toEqual(items);
  });
});

describe('handleReminderAudioPush', () => {
  it('downloads only valid items and skips the rest', async () => {
    const today = new Date().toISOString();
    const valid = { hash: GOOD_HASH, fmt: 'wav', url: GOOD_URL, fireAt: today };
    const farFuture = { hash: 'fedcba9876543210', fmt: 'mp3', url: GOOD_URL, fireAt: '2099-01-01T00:00:00.000Z' };
    const badHash = { hash: '../evil', fmt: 'wav', url: GOOD_URL, fireAt: today };
    const httpUrl = { hash: '1111222233334444', fmt: 'wav', url: 'http://abcdwxyz.supabase.co/x.wav', fireAt: today };
    const badFmt = { hash: '1111222233335555', fmt: 'ogg', url: GOOD_URL, fireAt: today };
    const badDate = { hash: '1111222233336666', fmt: 'wav', url: GOOD_URL, fireAt: 'not-a-date' };

    const result = await handleReminderAudioPush(
      buildReminderAudioPayload([valid, farFuture, badHash, httpUrl, badFmt, badDate] as ReminderAudioPushItem[]),
    );

    expect(result).toEqual({ downloaded: 1, skipped: 5 });
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(GOOD_HASH, 'wav', GOOD_URL);
    expect(download).not.toHaveBeenCalledWith('fedcba9876543210', 'mp3', GOOD_URL);
  });

  it('never deletes files: the sync owns cleanup, so the GC is not called', async () => {
    const today = new Date().toISOString();
    await handleReminderAudioPush(
      buildReminderAudioPayload([{ hash: GOOD_HASH, fmt: 'wav', url: GOOD_URL, fireAt: today }] as ReminderAudioPushItem[]),
    );
    expect(gc).not.toHaveBeenCalled();
  });

  it('counts a failed download as skipped and does not throw', async () => {
    download.mockImplementationOnce(async () => {
      throw new Error('network');
    });
    const today = new Date().toISOString();
    const result = await handleReminderAudioPush(
      buildReminderAudioPayload([{ hash: GOOD_HASH, fmt: 'wav', url: GOOD_URL, fireAt: today }] as ReminderAudioPushItem[]),
    );
    expect(result).toEqual({ downloaded: 0, skipped: 1 });
  });

  it('returns zero counts and leaves files alone when items is not valid JSON', async () => {
    const result = await handleReminderAudioPush({ type: 'reminder_audio', items: '{bad' });
    expect(result).toEqual({ downloaded: 0, skipped: 0 });
    expect(download).not.toHaveBeenCalled();
    expect(gc).not.toHaveBeenCalled();
  });
});
