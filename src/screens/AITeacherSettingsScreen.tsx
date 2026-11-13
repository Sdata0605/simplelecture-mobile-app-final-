import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  PRESET_OPTIONS,
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  DEFAULT_PREFS,
  TeacherPrefs,
  getCachedPrefs,
  loadPrefs,
  savePrefs,
} from '../services/aiTeacherPrefs';
import {
  AiTeacherKey,
  AiTeacherSettings,
  addAiTeacherKey,
  deleteAiTeacherKey,
  getAiTeacherSettings,
  reorderAiTeacherKeys,
  saveAiTeacherPrefs,
  setActiveAiTeacherKey,
  testAiTeacherKey,
  updateAiTeacherKey,
} from '../services/aiTeacherKeys';
import { PlanState, resolvePlanState } from '../services/aiTeacherPlan';
import { openAskAI } from '../services/askAIStore';
import { AITeacherGuideModal } from '../components/aiteacher/AITeacherGuideModal';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const GET_KEY_URL = 'https://aistudio.google.com/app/apikey';

function statusChip(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', bg: '#D1FAE5', fg: '#065F46' };
    case 'rate_limited':
      return { label: 'Rate limited', bg: '#FEF3C7', fg: '#92400E' };
    case 'invalid':
      return { label: 'Invalid', bg: '#FEE2E2', fg: '#B91C1C' };
    default:
      return { label: 'Untested', bg: '#F3F4F6', fg: colors.textSecondary };
  }
}

function errorMessage(err: any): string {
  switch (err?.code) {
    case 'KEY_LIMIT':
      return 'You already have 10 keys. Delete one to add another.';
    case 'DUPLICATE_KEY':
      return 'That key is already saved.';
    case 'INVALID_KEY':
      return 'Google did not accept this key. Check that you copied the whole key.';
    case 'NOT_FOUND':
      return 'That key no longer exists. Pull to refresh and try again.';
    case 'UNAUTHORIZED':
      return 'Please log in again to manage your keys.';
    case 'PLAN_REQUIRED':
      return 'Enroll in a course to add and manage your keys.';
    default:
      return String(err?.message || 'Something went wrong. Please try again.');
  }
}

export default function AITeacherSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const routeParams = route.params as { fromAskAI?: boolean } | undefined;
  const fromAskAI = !!routeParams?.fromAskAI;

  // Opened from Ask AI: going back (or unmounting for any reason) reopens Ask AI.
  const fromAskAIRef = useRef(fromAskAI);
  useEffect(() => {
    return () => {
      if (fromAskAIRef.current) openAskAI();
    };
  }, []);

  const [draft, setDraft] = useState<TeacherPrefs>(getCachedPrefs() || DEFAULT_PREFS);
  const [settings, setSettings] = useState<AiTeacherSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');

  const [guideModalOpen, setGuideModalOpen] = useState(false);

  const keys: AiTeacherKey[] = settings?.keys ?? [];
  const maxKeys = settings?.maxKeys ?? 10;
  // The enrollment state as the server answered it. 'inactive' only when the server said false; offline or no plan field is 'error'.
  const planState: PlanState = offline
    ? 'error'
    : !settings
      ? 'loading'
      : resolvePlanState({ serverActive: settings.plan?.active });
  // Key controls show when the student is enrolled, or when they were enrolled the last time the server said so and we are offline.
  const planActive = planState === 'active' || (planState === 'error' && settings?.plan?.active === true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getAiTeacherSettings();
      setSettings(s);
      setDraft(s.prefs);
      setOffline(false);
    } catch (err: any) {
      // Offline or server down: keep the cached persona prefs and say the keys cannot be changed right now.
      setOffline(true);
      setNotice({ ok: false, message: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrefs().then((p) => setDraft(p));
    void load();
  }, [load]);

  /** Runs one key action; on success the returned settings replace the key list. Returns null on failure. */
  const runKeyAction = async (
    busyKey: string,
    action: () => Promise<AiTeacherSettings>,
    okMessage?: string,
  ): Promise<AiTeacherSettings | null> => {
    setBusy(busyKey);
    setNotice(null);
    try {
      const s = await action();
      setSettings(s);
      setOffline(false);
      if (okMessage) setNotice({ ok: true, message: okMessage });
      return s;
    } catch (err: any) {
      setNotice({ ok: false, message: errorMessage(err) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleAddKey = async () => {
    const apiKey = newKey.trim();
    if (!apiKey) return;
    const label = newLabel.trim() || `Key ${keys.length + 1}`;
    const s = await runKeyAction('add', () => addAiTeacherKey(label, apiKey), 'Key added.');
    if (s) {
      setNewKey('');
      setNewLabel('');
      setShowAdd(false);
      setShowKey(false);
    }
  };

  const handleReplaceKey = async (id: string) => {
    const apiKey = editKey.trim();
    if (!apiKey) return;
    const s = await runKeyAction(`replace:${id}`, () => updateAiTeacherKey(id, { apiKey }), 'Key replaced.');
    if (s) {
      setEditingId(null);
      setEditKey('');
    }
  };

  const handleTestKey = async (id: string) => {
    const s = await runKeyAction(`test:${id}`, () => testAiTeacherKey(id));
    if (!s) return;
    const k = s.keys.find((x) => x.id === id);
    if (k?.status === 'active') setNotice({ ok: true, message: `${k.label} works.` });
    else if (k?.status === 'rate_limited') setNotice({ ok: false, message: `${k.label} is rate limited right now.` });
    else setNotice({ ok: false, message: k?.lastError || `${k?.label ?? 'This key'} did not pass the test.` });
  };

  const handleDeleteKey = (k: AiTeacherKey) => {
    Alert.alert('Delete this key?', `"${k.label}" will be removed from your account and the web app.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void runKeyAction(`delete:${k.id}`, () => deleteAiTeacherKey(k.id), 'Key deleted.');
        },
      },
    ]);
  };

  const handleMoveKey = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= keys.length) return;
    const ids = keys.map((k) => k.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void runKeyAction('reorder', () => reorderAiTeacherKeys(ids));
  };

  const handleUseKey = (id: string) => {
    void runKeyAction(`use:${id}`, () => setActiveAiTeacherKey(id), 'This key is now in use.');
  };

  const handleSave = async () => {
    const clean: TeacherPrefs = {
      ...draft,
      teacherName: draft.teacherName.trim(),
      custom: draft.custom.trim(),
    };
    setDraft(clean);
    await savePrefs(clean);
    try {
      const s = await saveAiTeacherPrefs(clean);
      setSettings(s);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      setNotice({ ok: false, message: `Saved on this device only. ${errorMessage(err)}` });
    }
  };

  const handleReset = async () => {
    setDraft(DEFAULT_PREFS);
    await savePrefs(DEFAULT_PREFS);
    try {
      const s = await saveAiTeacherPrefs(DEFAULT_PREFS);
      setSettings(s);
    } catch {
      // Stays reset on this device; the server copy updates the next time it is saved.
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const atLimit = keys.length >= maxKeys;

  // Until settings load (or the device is known to be offline), show only a loader.
  if (!settings && !offline) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Teacher Settings</Text>
          <View style={styles.guideBtn} />
        </View>
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Teacher Settings</Text>
        <TouchableOpacity style={styles.guideBtn} onPress={() => setGuideModalOpen(true)}>
          <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardShiftView style={styles.scrollArea}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xxl + insets.bottom + 20 }]}
      >
        {(offline || (settings && planState === 'error')) && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
            <Text style={styles.offlineText}>
              {offline
                ? 'You are offline. Your saved preferences are shown, but keys can only be changed when you are back online.'
                : 'Could not check your enrollment. Keys can only be changed once the check works.'}
            </Text>
            <TouchableOpacity onPress={() => void load()} disabled={loading}>
              <Text style={styles.offlineRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1. Enrollment status */}
        {settings && planActive && (
          <View style={styles.planActiveBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#047857" />
            <Text style={styles.planActiveText}>Enrolled</Text>
          </View>
        )}

        {planState === 'inactive' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="school" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Enroll in a course to start</Text>
            </View>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('Courses')}
            >
              <Ionicons name="arrow-forward" size={14} color="#059669" />
              <Text style={styles.guideLinkBtnText}>Browse courses</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2. Gemini Key Manager */}
        {planState === 'active' && keys.length === 0 && (
          <Text style={styles.startHint}>Add your Gemini key to start</Text>
        )}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="key" size={18} color="#D97706" />
            <Text style={styles.sectionTitle}>Your Gemini API keys</Text>
            <Text style={styles.keyCounter}>
              {keys.length} of {maxKeys}
            </Text>
          </View>
          <Text style={styles.sectionHint}>
            Add up to 10 keys. If one runs out, the next is used automatically.
          </Text>

          {planActive && (
            <TouchableOpacity style={styles.linkRow} onPress={() => void Linking.openURL(GET_KEY_URL)}>
              <Ionicons name="open-outline" size={14} color="#059669" />
              <Text style={styles.guideLinkBtnText}>Get a free key</Text>
            </TouchableOpacity>
          )}

          {loading && !settings && <ActivityIndicator style={styles.loader} color={colors.primary} />}

          {!loading && keys.length === 0 && (
            <View style={styles.emptyKeys}>
              <Text style={styles.emptyKeysText}>
                {planActive
                  ? 'Add your Gemini key to start using Ask AI.'
                  : planState === 'error'
                    ? 'Your keys will show here once the enrollment check works.'
                    : 'Enroll in a course to add your keys.'}
              </Text>
            </View>
          )}

          {keys.map((k, index) => {
            const chip = statusChip(k.status);
            const isActive = k.id === settings?.activeKeyId;
            const isBusy = !!busy && busy.endsWith(k.id);
            return (
              <View key={k.id} style={[styles.keyRow, isActive && styles.keyRowActive]}>
                <View style={styles.keyRowTop}>
                  <View style={styles.keyRowText}>
                    <Text style={styles.keyLabel} numberOfLines={1}>{k.label}</Text>
                    <Text style={styles.keyMasked}>{k.masked}</Text>
                  </View>
                  {planActive && (
                  <View style={styles.reorderCol}>
                    <TouchableOpacity
                      onPress={() => handleMoveKey(index, -1)}
                      disabled={index === 0 || !!busy}
                      style={[styles.arrowBtn, (index === 0 || !!busy) && styles.disabledBtn]}
                      accessibilityLabel="Move key up"
                    >
                      <Ionicons name="chevron-up" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoveKey(index, 1)}
                      disabled={index === keys.length - 1 || !!busy}
                      style={[styles.arrowBtn, (index === keys.length - 1 || !!busy) && styles.disabledBtn]}
                      accessibilityLabel="Move key down"
                    >
                      <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  )}
                </View>

                <View style={styles.chipRow}>
                  <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                    <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
                  </View>
                  {isActive && (
                    <View style={styles.inUseBadge}>
                      <Text style={styles.inUseText}>In use</Text>
                    </View>
                  )}
                  {isBusy && <ActivityIndicator size="small" color={colors.primary} />}
                </View>

                {!!k.lastError && (
                  <Text style={styles.keyErrorText}>
                    Last error: {k.lastError}
                  </Text>
                )}

                {editingId === k.id ? (
                  <View style={styles.editBox}>
                    <View style={styles.keyInputRow}>
                      <TextInput
                        style={styles.keyInput}
                        placeholder="Paste the new Gemini key"
                        value={editKey}
                        onChangeText={setEditKey}
                        secureTextEntry={!showKey}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowKey(!showKey)}>
                        <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.keyActionsLeft}>
                      <TouchableOpacity
                        style={[styles.keyActionBtn, styles.saveKeyBtn, !editKey.trim() && styles.saveKeyBtnDisabled]}
                        disabled={!editKey.trim() || !!busy}
                        onPress={() => void handleReplaceKey(k.id)}
                      >
                        <Text style={styles.saveKeyBtnText}>Save key</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.keyActionBtn, styles.testKeyBtn]}
                        onPress={() => {
                          setEditingId(null);
                          setEditKey('');
                        }}
                      >
                        <Text style={styles.testKeyBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : planActive ? (
                  <View style={styles.keyActionsWrap}>
                    <TouchableOpacity
                      style={[styles.keyActionBtn, styles.testKeyBtn, !!busy && styles.disabledBtn]}
                      disabled={!!busy || offline}
                      onPress={() => {
                        setEditKey('');
                        setShowKey(false);
                        setEditingId(k.id);
                      }}
                    >
                      <Text style={styles.testKeyBtnText}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.keyActionBtn, styles.testKeyBtn, !!busy && styles.disabledBtn]}
                      disabled={!!busy || offline}
                      onPress={() => void handleTestKey(k.id)}
                    >
                      <Text style={styles.testKeyBtnText}>Test</Text>
                    </TouchableOpacity>
                    {!isActive && (
                      <TouchableOpacity
                        style={[styles.keyActionBtn, styles.testKeyBtn, !!busy && styles.disabledBtn]}
                        disabled={!!busy || offline}
                        onPress={() => handleUseKey(k.id)}
                      >
                        <Text style={styles.testKeyBtnText}>Use this key</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.keyActionBtn, styles.deleteKeyBtn, !!busy && styles.disabledBtn]}
                      disabled={!!busy || offline}
                      onPress={() => handleDeleteKey(k)}
                    >
                      <Text style={styles.deleteKeyBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}

          {!planActive ? null : showAdd ? (
            <View style={styles.addBox}>
              <TextInput
                style={styles.textInput}
                placeholder="Label, e.g. School Gmail"
                value={newLabel}
                onChangeText={setNewLabel}
                maxLength={40}
              />
              <View style={styles.keyInputRow}>
                <TextInput
                  style={styles.keyInput}
                  placeholder="Paste Google Gemini API Key"
                  value={newKey}
                  onChangeText={setNewKey}
                  secureTextEntry={!showKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowKey(!showKey)}>
                  <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.keyActionsLeft}>
                <TouchableOpacity
                  style={[styles.keyActionBtn, styles.saveKeyBtn, (!newKey.trim() || !!busy) && styles.saveKeyBtnDisabled]}
                  disabled={!newKey.trim() || !!busy}
                  onPress={() => void handleAddKey()}
                >
                  {busy === 'add' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveKeyBtnText}>Save key</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.keyActionBtn, styles.testKeyBtn]}
                  onPress={() => {
                    setShowAdd(false);
                    setNewKey('');
                    setNewLabel('');
                  }}
                >
                  <Text style={styles.testKeyBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addKeyBtn, (atLimit || offline) && styles.saveKeyBtnDisabled]}
              disabled={atLimit || offline || loading}
              onPress={() => setShowAdd(true)}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addKeyBtnText}>
                {atLimit ? `Add key (limit of ${maxKeys} reached)` : 'Add key'}
              </Text>
            </TouchableOpacity>
          )}

          {notice && (
            <View style={[styles.testFeedbackBox, notice.ok ? styles.testFeedbackSuccess : styles.testFeedbackError]}>
              <Ionicons
                name={notice.ok ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={notice.ok ? '#059669' : '#DC2626'}
              />
              <Text style={[styles.testFeedbackText, notice.ok ? styles.testFeedbackTextSuccess : styles.testFeedbackTextError]}>
                {notice.message}
              </Text>
            </View>
          )}

          <Text style={styles.privacyNotice}>
            Keys are saved to your SimpleLecture account and shared with the web app. Only the last few characters are shown.
          </Text>
        </View>

        {/* Teacher Personality Preset */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="color-palette" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Teacher Personality</Text>
          </View>
          <Text style={styles.sectionHint}>Select how your teacher talks and teaches:</Text>

          <View style={styles.presetGrid}>
            {PRESET_OPTIONS.map((p) => {
              const isSelected = draft.preset === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.presetCard, isSelected && styles.presetCardActive]}
                  onPress={() => setDraft((prev) => ({ ...prev, preset: p.id }))}
                >
                  <Text style={styles.presetEmoji}>{p.emoji}</Text>
                  <View style={styles.presetTextWrap}>
                    <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]}>
                      {p.label}
                    </Text>
                    <Text style={styles.presetDesc}>{p.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 4. Voice Selection */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="volume-medium" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Teacher's Voice</Text>
          </View>
          <Text style={styles.sectionHint}>Used in interactive Voice classes:</Text>

          <View style={styles.voiceGrid}>
            {VOICE_OPTIONS.map((v) => {
              const isSelected = draft.voice === v.id;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.voiceCard, isSelected && styles.voiceCardActive]}
                  onPress={() => setDraft((prev) => ({ ...prev, voice: v.id }))}
                >
                  <Text style={[styles.voiceName, isSelected && styles.voiceNameActive]}>
                    {v.id}
                  </Text>
                  <Text style={styles.voiceDesc}>{v.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 5. Language Selection */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="language" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Reply Language</Text>
          </View>

          <View style={styles.languageRow}>
            {LANGUAGE_OPTIONS.map((l) => {
              const isSelected = draft.language === l.id;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.langChip, isSelected && styles.langChipActive]}
                  onPress={() => setDraft((prev) => ({ ...prev, language: l.id }))}
                >
                  <Text style={[styles.langChipText, isSelected && styles.langChipTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 6. Teacher Name */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="person" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Teacher's Name</Text>
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Asha Madam, Ramesh Sir"
            value={draft.teacherName}
            onChangeText={(t) => setDraft((prev) => ({ ...prev, teacherName: t }))}
            maxLength={30}
          />
        </View>

        {/* 7. Custom Instructions */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Custom Instructions (Optional)</Text>
          </View>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="e.g. Call me champion. Use cricket examples. Explain in simple terms."
            value={draft.custom}
            onChangeText={(t) => setDraft((prev) => ({ ...prev, custom: t }))}
            multiline
            numberOfLines={3}
            maxLength={300}
          />
          <Text style={styles.charCount}>{draft.custom.length}/300</Text>
        </View>

        {/* Buttons */}
        <View style={styles.footerBtns}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Ionicons name="save-outline" size={18} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>Save Preferences</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>Reset Defaults</Text>
          </TouchableOpacity>
        </View>

        {savedSuccess && (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.savedBannerText}>Preferences saved successfully!</Text>
          </View>
        )}
      </ScrollView>
      </KeyboardShiftView>

      <AITeacherGuideModal
        visible={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        defaultTab="how-to-use"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  guideBtn: {
    padding: spacing.xs,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchasedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  purchasedBannerText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#065F46',
  },
  planActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  planActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  startHint: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  keyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  keyInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: 'monospace',
  },
  eyeBtn: {
    paddingHorizontal: spacing.sm,
  },
  keyActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveKeyBtn: {
    backgroundColor: colors.primary,
  },
  saveKeyBtnDisabled: {
    opacity: 0.5,
  },
  saveKeyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  keyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
  },
  testKeyBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  testKeyBtnText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  guideLinkBtnText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '600',
  },
  testFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: 4,
  },
  testFeedbackSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  testFeedbackError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  testFeedbackText: {
    fontSize: 11,
    flex: 1,
  },
  testFeedbackTextSuccess: {
    color: '#065F46',
    fontWeight: '600',
  },
  testFeedbackTextError: {
    color: '#B91C1C',
  },
  privacyNotice: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  presetGrid: {
    gap: 8,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  presetCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#ECFDF5',
  },
  presetEmoji: {
    fontSize: 24,
  },
  presetTextWrap: {
    flex: 1,
  },
  presetLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  presetLabelActive: {
    color: colors.primary,
  },
  presetDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 10,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  voiceCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  voiceCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#ECFDF5',
  },
  voiceName: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  voiceNameActive: {
    color: colors.primary,
  },
  voiceDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  langChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  langChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#ECFDF5',
  },
  langChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  langChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  footerBtns: {
    gap: 8,
    marginTop: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
  },
  saveBtnText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  resetBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resetBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  savedBannerText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#065F46',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  offlineText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
  },
  offlineRetry: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  keyCounter: {
    marginLeft: 'auto',
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  loader: {
    marginVertical: spacing.md,
  },
  emptyKeys: {
    backgroundColor: '#FFFBEB',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  emptyKeysText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  keyRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    gap: 6,
    backgroundColor: colors.surface,
  },
  keyRowActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  keyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keyRowText: {
    flex: 1,
    gap: 2,
  },
  keyLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  keyMasked: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  reorderCol: {
    flexDirection: 'column',
  },
  arrowBtn: {
    padding: 2,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  inUseBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  inUseText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  keyErrorText: {
    fontSize: 10,
    color: '#B91C1C',
    lineHeight: 14,
  },
  keyActionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  deleteKeyBtn: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteKeyBtnText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  editBox: {
    gap: 8,
  },
  addBox: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  addKeyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
  },
  addKeyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
