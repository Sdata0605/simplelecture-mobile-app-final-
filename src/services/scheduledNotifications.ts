import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { SUPABASE_URL as SB_PROXY_URL, SUPABASE_ANON_KEY as SB_ANON_KEY, AUTH_TOKEN_KEY, getValidAccessToken } from './supabase';

const WELCOME_SHOWN_KEY = 'welcome_notification_shown';
const LOGIN_WELCOME_LAST_KEY = 'login_welcome_last_sent';
const MOTIVATIONAL_NOTIF_ID = 'motivational_recurring';
const STUDY_REMINDER_PREFIX = 'study-reminder-';
const STUDY_REMINDER_WINDOW_DAYS = 7;
const STUDY_REMINDER_MAX = 60;
const LOGIN_WELCOME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const SUPABASE_URL = 'https://oxwhqvsoelqqsblmqkxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94d2hxdnNvZWxxcXNibG1xa3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTU4NTgsImV4cCI6MjA3NTA5MTg1OH0.nZbWSb9AQK5uGAQmc7zXAceTHm9GRQJvqkg4-LNo_DM';

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

const motivationalMessages = [
  { title: 'Dream Big, Start Small', body: 'Every expert was once a beginner. Open a lesson and take the first step today.' },
  { title: 'Your Future Self Will Thank You', body: 'The effort you put in today shapes the success of tomorrow. Keep learning!' },
  { title: 'Greatness Takes Patience', body: 'Rome was not built in a day, but they were laying bricks every hour. Lay yours now.' },
  { title: 'Unlock Your Potential', body: 'You have abilities you have not discovered yet. A new lesson could reveal them.' },
  { title: 'Small Steps, Big Results', body: 'Just 15 minutes of focused study can change your understanding of a subject.' },
  { title: 'Discipline Beats Motivation', body: 'Motivation gets you started, but discipline keeps you going. Show up today.' },
  { title: 'Curiosity Is Your Superpower', body: 'The most successful people never stop asking questions. What will you learn today?' },
  { title: 'Be Unstoppable', body: 'Obstacles are what you see when you take your eyes off the goal. Stay focused!' },
  { title: 'Invest In Your Mind', body: 'The best investment you can make is in yourself. Knowledge pays the best dividends.' },
  { title: 'You Are Closer Than You Think', body: 'Every lesson completed brings you one step closer to mastery. Keep going!' },
  { title: 'Turn Minutes Into Mastery', body: 'Success is the sum of small efforts repeated day after day. Start now.' },
  { title: 'Rise Above Average', body: 'Average people watch TV. Extraordinary people learn. Which one are you today?' },
  { title: 'The Power of Consistency', body: 'A river cuts through rock not because of its power, but because of its persistence.' },
  { title: 'Feed Your Ambition', body: 'Your brain is hungry for knowledge. Feed it with a new lecture today.' },
  { title: 'Make Today Count', body: 'You will never get this day back. Make it a day of growth and learning.' },
  { title: 'Knowledge Is Freedom', body: 'Education is the most powerful weapon you can use to change the world.' },
  { title: 'Challenge Yourself', body: 'Growth happens outside your comfort zone. Try a difficult topic today.' },
  { title: 'The Secret to Success', body: 'Successful people do what unsuccessful people are not willing to do. Study now.' },
  { title: 'Build Your Empire', body: 'Every subject you master is a brick in the empire of your career. Keep building.' },
  { title: 'Stay Hungry, Stay Curious', body: 'The day you stop learning is the day you stop growing. Never stop.' },
  { title: 'Your Brain Deserves This', body: 'Give your mind the workout it deserves. A quick lesson can make a huge difference.' },
  { title: 'Winners Never Quit', body: 'The difference between a winner and a loser is that a winner tries one more time.' },
  { title: 'Focus Creates Champions', body: 'Concentrate all your thoughts on the task at hand. Focused effort wins every time.' },
  { title: 'Believe In Your Journey', body: 'Trust the process. Every hour you study brings you closer to your dreams.' },
  { title: 'Ignite Your Passion', body: 'Passion fueled by knowledge is unstoppable. Discover something exciting today.' },
  { title: 'Learn Like a Pro', body: 'Professionals practice daily. Make learning your daily habit and watch yourself grow.' },
  { title: 'Break Your Limits', body: 'The only limits that exist are the ones you place on yourself. Push beyond them.' },
  { title: 'Wisdom Awaits You', body: 'Behind every great achievement is a person who never stopped learning. Be that person.' },
  { title: 'Your Time Is Now', body: 'Stop waiting for the perfect moment. The best time to learn is right now.' },
  { title: 'Think Big, Act Bold', body: 'Big dreams require bold actions. Take one bold step toward your goal today.' },
  { title: 'Excellence Is a Habit', body: 'We are what we repeatedly do. Excellence is not an act but a habit.' },
  { title: 'Embrace the Struggle', body: 'Difficult roads often lead to beautiful destinations. Keep pushing through.' },
  { title: 'Shine Brighter Every Day', body: 'You are a work in progress, and every lesson makes you shine a little brighter.' },
  { title: 'Own Your Success', body: 'Nobody will hand you success. You have to earn it one lesson at a time.' },
  { title: 'The World Needs You', body: 'The world needs educated, passionate people. Your learning matters more than you know.' },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Simple Lecture',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2BBD6E',
      sound: 'default',
    });
    console.log('[Notifications] Android channel created');
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  console.log('[Notifications] Permission status:', finalStatus);
  return finalStatus === 'granted';
}

export async function setupAndScheduleNotifications(): Promise<void> {
  console.log('[Notifications] ========== FULL NOTIFICATION SETUP START ==========');
  console.log('[Notifications] Platform:', Platform.OS);
  console.log('[Notifications] isExpoGo:', isExpoGo());
  try {
    const granted = await requestNotificationPermissions();
    console.log('[Notifications] Permission granted:', granted);
    if (!granted) {
      console.log('[Notifications] ABORTED: Permission not granted');
      console.log('[Notifications] ========== FULL NOTIFICATION SETUP END ==========');
      return;
    }

    await ensureNotificationChannel();
    console.log('[Notifications] Channel ensured');

    const beforeCancel = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[Notifications] Notifications before cancel:', beforeCancel.length);
    beforeCancel.forEach(n => console.log(`[Notifications]   Before: id=${n.identifier}, title="${n.content.title}"`));

    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] Cleared all previously scheduled notifications');

    if (isExpoGo()) {
      console.log('[Notifications] Running in Expo Go — skipping repeating notifications');
      console.log('[Notifications] ========== FULL NOTIFICATION SETUP END ==========');
      return;
    }

    console.log('[Notifications] Step 1/3: Scheduling motivational notifications...');
    await scheduleMotivationalNotifications();
    console.log('[Notifications] Step 2/3: Sending first open welcome...');
    await sendFirstOpenWelcome();
    // Blog notifications are now delivered as real FCM push from the
    // send-blog-notification edge function (fired by a DB trigger on publish),
    // so there is no local blog scheduling here anymore.
    console.log('[Notifications] Step 3/3: Scheduling study reminders...');
    await scheduleStudyReminders();
    console.log('[Notifications] All notifications scheduled successfully');

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[Notifications] Total scheduled after setup:', scheduled.length);
    scheduled.forEach(n => console.log(`[Notifications]   Final: id=${n.identifier}, title="${n.content.title}", trigger=${JSON.stringify(n.trigger)}`));
    console.log('[Notifications] ========== FULL NOTIFICATION SETUP END ==========');
  } catch (error) {
    console.error('[Notifications] FATAL Setup failed:', error);
    console.log('[Notifications] ========== FULL NOTIFICATION SETUP END (ERROR) ==========');
  }
}

export async function scheduleMotivationalNotifications(): Promise<void> {
  if (isExpoGo()) {
    console.log('[Notifications] Skipping repeating notifications in Expo Go (not supported)');
    return;
  }

  try {
    const msg = pickRandom(motivationalMessages);
    await Notifications.scheduleNotificationAsync({
      identifier: MOTIVATIONAL_NOTIF_ID,
      content: {
        title: msg.title,
        body: msg.body,
        sound: 'default',
        data: { type: 'motivation', screen: 'MainTabs' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 18000,
        repeats: true,
      },
    });
    console.log('[Notifications] Scheduled motivational notification every 5 hours');
  } catch (error) {
    console.error('[Notifications] Failed to schedule motivational notifications:', error);
  }
}

async function sendFirstOpenWelcome(): Promise<void> {
  try {
    const alreadyShown = await AsyncStorage.getItem(WELCOME_SHOWN_KEY);
    if (alreadyShown) {
      console.log('[Notifications] Welcome notification already shown');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Welcome to Simple Lecture!',
        body: 'We are thrilled to have you here. Explore courses, watch AI-powered lectures, and start your learning journey today.',
        sound: 'default',
        data: { type: 'welcome', screen: 'MainTabs' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 30,
        repeats: false,
      },
    });

    await AsyncStorage.setItem(WELCOME_SHOWN_KEY, 'true');
    console.log('[Notifications] Welcome notification scheduled for first open (30s delay)');
  } catch (error) {
    console.error('[Notifications] Failed to send welcome notification:', error);
  }
}

export async function sendWelcomeLoginNotification(): Promise<void> {
  if (isExpoGo()) {
    console.log('[Notifications] Skipping login welcome in Expo Go');
    return;
  }

  try {
    const lastSent = await AsyncStorage.getItem(LOGIN_WELCOME_LAST_KEY);
    if (lastSent) {
      const elapsed = Date.now() - parseInt(lastSent, 10);
      if (elapsed < LOGIN_WELCOME_COOLDOWN_MS) {
        console.log('[Notifications] Login welcome skipped (cooldown active)');
        return;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Welcome Back to Simple Lecture!',
        body: 'You are all set! Dive into your courses, track your progress, and achieve greatness. Your learning journey continues now.',
        sound: 'default',
        data: { type: 'welcome_login', screen: 'MainTabs' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 30,
        repeats: false,
      },
    });

    await AsyncStorage.setItem(LOGIN_WELCOME_LAST_KEY, Date.now().toString());
    console.log('[Notifications] Login welcome notification scheduled (30s delay)');
  } catch (error) {
    console.error('[Notifications] Failed to send login welcome notification:', error);
  }
}

// ─── Study-time reminders ─────────────────────────────────────────────────────
// Local notifications fired at each upcoming pending study-plan slot, reminding
// the student to complete the specific topic/chapter for that slot. Sessions are
// stored in UTC; `new Date(scheduled_at)` + a DATE trigger fires at the correct
// local wall-clock time automatically.

interface StudyReminderSession {
  id: string;
  title: string | null;
  scheduled_at: string;
  status: string;
}

const studyReminderTitles = [
  '⏰ Study time!',
  '📚 Your study slot is here',
  '🎯 Time to learn',
  "✨ Let's get learning",
  '🔥 Keep the momentum going',
];

/** Deterministic index from a session id so the same slot keeps the same
 *  wording across reschedules (prevents the copy flip-flopping on every pass). */
function hashIndex(id: string, len: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return len > 0 ? h % len : 0;
}

function buildStudyReminderBody(title: string | null, id: string): string {
  const topic = title?.trim();
  if (topic) {
    const variants = [
      `It's time to study "${topic}". A focused session now moves you one step closer to your goal.`,
      `Your scheduled slot for "${topic}" starts now — open Simple Lecture and dive right in!`,
      `Ready to master "${topic}"? Your study time is here. Let's make it count.`,
      `Don't break your streak! "${topic}" is up next on your plan — give it 25 focused minutes.`,
      `Small steps add up to big results. Time to tackle "${topic}" now.`,
    ];
    return variants[hashIndex(id + 'b', variants.length)];
  }
  const generic = [
    'Your scheduled study time is here. Open Simple Lecture and keep your plan on track!',
    'Time to study! A focused session now keeps you moving toward your goal.',
    "Your study slot starts now — let's make it count.",
  ];
  return generic[hashIndex(id + 'b', generic.length)];
}

async function fetchUpcomingStudySessions(): Promise<StudyReminderSession[]> {
  try {
    const token = await getValidAccessToken();
    if (!token) {
      console.log('[StudyReminder] No auth token — skipping fetch');
      return [];
    }
    const now = new Date().toISOString();
    const windowEnd = new Date(Date.now() + STUDY_REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const url =
      `${SB_PROXY_URL}/rest/v1/study_timetable_sessions` +
      `?select=id,title,scheduled_at,status` +
      `&status=eq.pending&scheduled_at=gte.${now}&scheduled_at=lte.${windowEnd}` +
      `&order=scheduled_at.asc`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SB_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      console.error('[StudyReminder] Failed to fetch sessions:', res.status);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[StudyReminder] Error fetching sessions:', error);
    return [];
  }
}

/** Schedule one local reminder per upcoming pending study slot (next 7 days) and
 *  cancel any previously-scheduled study reminders that are now done, skipped,
 *  removed, or past. Idempotent — re-running replaces rather than duplicates,
 *  because each notification uses a stable per-slot identifier. */
export async function scheduleStudyReminders(): Promise<void> {
  if (isExpoGo()) {
    console.log('[StudyReminder] Skipping in Expo Go (local scheduling unsupported)');
    return;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('[StudyReminder] Notification permission not granted — skipping');
      return;
    }

    await ensureNotificationChannel();

    const sessions = await fetchUpcomingStudySessions();
    const nowMs = Date.now();
    const valid = sessions
      .filter(s => s.status === 'pending')
      .map(s => ({ session: s, fire: new Date(s.scheduled_at) }))
      .filter(s => !isNaN(s.fire.getTime()) && s.fire.getTime() > nowMs)
      .sort((a, b) => a.fire.getTime() - b.fire.getTime())
      .slice(0, STUDY_REMINDER_MAX);

    const validIds = new Set(valid.map(s => `${STUDY_REMINDER_PREFIX}${s.session.id}`));

    // Cancel stale reminders (completed / skipped / removed / past).
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    let cancelled = 0;
    for (const n of scheduled) {
      if (n.identifier.startsWith(STUDY_REMINDER_PREFIX) && !validIds.has(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
        cancelled++;
      }
    }

    // Schedule / refresh reminders for valid upcoming slots.
    let scheduledCount = 0;
    for (const { session, fire } of valid) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${STUDY_REMINDER_PREFIX}${session.id}`,
          content: {
            title: studyReminderTitles[hashIndex(session.id, studyReminderTitles.length)],
            body: buildStudyReminderBody(session.title, session.id),
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
            data: { type: 'study_reminder', screen: 'StudyTimetable' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fire,
          },
        });
        scheduledCount++;
      } catch (err) {
        console.error(`[StudyReminder] Failed to schedule for session ${session.id}:`, err);
      }
    }

    console.log(`[StudyReminder] Scheduled ${scheduledCount} reminder(s), cancelled ${cancelled} stale`);
  } catch (error) {
    console.error('[StudyReminder] Failed to schedule study reminders:', error);
  }
}

export async function cancelDailyNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  console.log('[Notifications] All notifications cancelled');
}
