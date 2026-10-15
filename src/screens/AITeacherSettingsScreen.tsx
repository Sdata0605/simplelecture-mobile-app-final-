import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import {
  PRESET_OPTIONS,
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  DEFAULT_PREFS,
  TeacherPrefs,
  loadPrefs,
  savePrefs,
} from '../services/aiTeacherPrefs';
import { testGeminiApiKey } from '../services/aiTeacherService';
import { useAITeacherSubscription } from '../services/aiTeacherSubscription';
import { AITeacherPlanModal } from '../components/aiteacher/AITeacherPlanModal';
import { AITeacherGuideModal } from '../components/aiteacher/AITeacherGuideModal';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AITeacherSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { isAuthenticated } = useAuth();
  const { currentPlan, hasActivePlan, isPlan500, isPlan1000 } = useAITeacherSubscription();

  const [draft, setDraft] = useState<TeacherPrefs>(DEFAULT_PREFS);
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guideTab, setGuideTab] = useState<'how-to-use' | 'api-key'>('api-key');

  useEffect(() => {
    loadPrefs().then((p) => {
      setDraft(p);
    });
  }, []);

  const handleTestKey = async () => {
    const keyToTest = draft.apiKey.trim();
    if (!keyToTest) return;
    setTestingKey(true);
    setTestResult(null);
    const result = await testGeminiApiKey(keyToTest);
    setTestResult(result);
    setTestingKey(false);
  };

  const handleSaveKey = async () => {
    const cleanKey = draft.apiKey.trim();
    if (!cleanKey) return;
    setSavingKey(true);
    // Save just the key + mode onto whatever is already persisted, so this button
    // doesn't silently also commit other unsaved edits elsewhere on this screen.
    const current = await loadPrefs();
    const updated: TeacherPrefs = { ...current, apiKey: cleanKey, apiMode: draft.apiMode };
    await savePrefs(updated);
    setDraft((prev) => ({ ...prev, apiKey: updated.apiKey, apiMode: updated.apiMode }));
    setSavingKey(false);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const handleSave = async () => {
    const clean: TeacherPrefs = {
      ...draft,
      apiKey: draft.apiKey.trim(),
      apiMode: draft.apiMode || 'admin',
      teacherName: draft.teacherName.trim(),
      custom: draft.custom.trim(),
    };
    await savePrefs(clean);
    setDraft(clean);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = async () => {
    await savePrefs(DEFAULT_PREFS);
    setDraft(DEFAULT_PREFS);
    setTestResult(null);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Teacher Settings</Text>
        <TouchableOpacity
          style={styles.guideBtn}
          onPress={() => {
            setGuideTab('how-to-use');
            setGuideModalOpen(true);
          }}
        >
          <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardShiftView style={styles.scrollArea}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xxl + insets.bottom + 20 }]}
      >
        {/* Active Plan Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Your AI Teacher Plan</Text>
          </View>
          <View style={styles.planInfoBox}>
            <View style={styles.planInfoTop}>
              <Text style={styles.planInfoName}>
                {hasActivePlan ? currentPlan?.name : 'No Active Plan'}
              </Text>
              {hasActivePlan && (
                <View
                  style={[
                    styles.planBadge,
                    isPlan1000 ? styles.planBadgePro : styles.planBadgeByok,
                  ]}
                >
                  <Text
                    style={[
                      styles.planBadgeText,
                      isPlan1000 ? styles.planBadgeTextPro : styles.planBadgeTextByok,
                    ]}
                  >
                    {isPlan1000 ? 'Pro Plan (₹1,000)' : 'Plus Plan (₹500)'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.planInfoDesc}>
              {isPlan1000
                ? 'Your Pro Plan includes built-in SimpleLecture AI quota. You can also optionally add your own Gemini key below for higher rate limits.'
                : isPlan500
                ? 'Your Plus Plan uses your personal Google Gemini API key configured below.'
                : 'Purchase a plan to unlock 1-to-1 voice and chat tutoring.'}
            </Text>
            <TouchableOpacity
              style={styles.changePlanBtn}
              onPress={() => setPlanModalOpen(true)}
            >
              <Text style={styles.changePlanBtnText}>
                {hasActivePlan ? 'Change Plan' : 'Choose Plan'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Gemini API Key Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="key" size={18} color="#D97706" />
            <Text style={styles.sectionTitle}>AI Key Source & Gemini API Key</Text>
          </View>

          {/* Mode Switch Cards */}
          <Text style={styles.fieldLabel}>Active Key Mode</Text>
          <View style={styles.modeCardsRow}>
            <TouchableOpacity
              style={[
                styles.modeCard,
                draft.apiMode === 'admin' && styles.modeCardActive,
              ]}
              onPress={() => setDraft((prev) => ({ ...prev, apiMode: 'admin' }))}
              activeOpacity={0.8}
            >
              <View style={styles.modeRadioOuter}>
                {draft.apiMode === 'admin' && <View style={styles.modeRadioInner} />}
              </View>
              <View style={styles.modeCardTextCol}>
                <View style={styles.modeCardTitleRow}>
                  <Text style={styles.modeCardTitle}>Managed Key</Text>
                  <View style={styles.modeBadgeAdmin}>
                    <Text style={styles.modeBadgeAdminText}>Built-in</Text>
                  </View>
                </View>
                <Text style={styles.modeCardDesc}>SimpleLecture key pool</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeCard,
                draft.apiMode === 'own' && styles.modeCardActive,
              ]}
              onPress={() => setDraft((prev) => ({ ...prev, apiMode: 'own' }))}
              activeOpacity={0.8}
            >
              <View style={styles.modeRadioOuter}>
                {draft.apiMode === 'own' && <View style={styles.modeRadioInner} />}
              </View>
              <View style={styles.modeCardTextCol}>
                <View style={styles.modeCardTitleRow}>
                  <Text style={styles.modeCardTitle}>My Own Key</Text>
                  <View style={styles.modeBadgeOwn}>
                    <Text style={styles.modeBadgeOwnText}>Higher Limits</Text>
                  </View>
                </View>
                <Text style={styles.modeCardDesc}>Google AI Studio key</Text>
              </View>
            </TouchableOpacity>
          </View>

          {draft.apiMode === 'admin' ? (
            <View style={styles.modeStatusBoxAdmin}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.modeStatusTextAdmin}>
                Currently Active: Using SimpleLecture Managed Key.
              </Text>
            </View>
          ) : (
            <View style={styles.modeStatusBoxOwn}>
              <Ionicons name="sparkles" size={16} color="#D97706" />
              <Text style={styles.modeStatusTextOwn}>
                Currently Active: Using your personal Gemini API key.
              </Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>
            Personal Gemini API Key {draft.apiMode === 'admin' ? '(Stored for later)' : ''}
          </Text>

          <View style={styles.keyInputRow}>
            <TextInput
              style={styles.keyInput}
              placeholder="Paste Google Gemini API Key"
              value={draft.apiKey}
              onChangeText={(t) => {
                setDraft((prev) => ({ ...prev, apiKey: t }));
                setTestResult(null);
              }}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowKey(!showKey)}>
              <Ionicons
                name={showKey ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.keyActionsRow}>
            <View style={styles.keyActionsLeft}>
              <TouchableOpacity
                style={[styles.keyActionBtn, styles.testKeyBtn]}
                disabled={!draft.apiKey.trim() || testingKey}
                onPress={handleTestKey}
              >
                {testingKey ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="flash-outline" size={14} color={colors.primary} />
                    <Text style={styles.testKeyBtnText}>Test Key</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.keyActionBtn,
                  styles.saveKeyBtn,
                  !draft.apiKey.trim() && styles.saveKeyBtnDisabled,
                ]}
                disabled={!draft.apiKey.trim() || savingKey}
                onPress={handleSaveKey}
              >
                {savingKey ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name={keySaved ? 'checkmark' : 'save-outline'} size={14} color="#FFFFFF" />
                    <Text style={styles.saveKeyBtnText}>{keySaved ? 'Saved' : 'Save Key'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.guideLinkBtn}
              onPress={() => {
                setGuideTab('api-key');
                setGuideModalOpen(true);
              }}
            >
              <Ionicons name="help-circle-outline" size={14} color="#059669" />
              <Text style={styles.guideLinkBtnText}>How to get free key?</Text>
            </TouchableOpacity>
          </View>

          {draft.apiMode === 'own' && !draft.apiKey.trim() && (
            <Text style={styles.keyModeHint}>
              Paste your key and tap "Save Key" to actually switch to it — selecting this mode alone doesn't activate it.
            </Text>
          )}

          {testResult && (
            <View
              style={[
                styles.testFeedbackBox,
                testResult.ok ? styles.testFeedbackSuccess : styles.testFeedbackError,
              ]}
            >
              <Ionicons
                name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={testResult.ok ? '#059669' : '#DC2626'}
              />
              <Text
                style={[
                  styles.testFeedbackText,
                  testResult.ok ? styles.testFeedbackTextSuccess : styles.testFeedbackTextError,
                ]}
              >
                {testResult.message}
              </Text>
            </View>
          )}

          <Text style={styles.privacyNotice}>
            🔒 Your key is kept strictly on this device and never stored on our servers.
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

        {/* Teacher Name */}
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

        {/* Voice Selection */}
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

        {/* Language Selection */}
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

        {/* Custom Instructions */}
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

      <AITeacherPlanModal visible={planModalOpen} onClose={() => setPlanModalOpen(false)} />
      <AITeacherGuideModal
        visible={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        defaultTab={guideTab}
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
  sectionCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  planInfoBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: 6,
  },
  planInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planInfoName: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  planBadgePro: {
    backgroundColor: '#D1FAE5',
  },
  planBadgeByok: {
    backgroundColor: '#FEF3C7',
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  planBadgeTextPro: {
    color: '#047857',
  },
  planBadgeTextByok: {
    color: '#B45309',
  },
  planInfoDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  changePlanBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    marginTop: 4,
  },
  changePlanBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
    marginBottom: 2,
  },
  modeCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  modeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 10,
    backgroundColor: colors.surface,
  },
  modeCardActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  modeRadioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  modeRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  modeCardTextCol: {
    flex: 1,
    gap: 2,
  },
  modeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  modeCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  modeBadgeAdmin: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  modeBadgeAdminText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#065F46',
  },
  modeBadgeOwn: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  modeBadgeOwnText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#92400E',
  },
  modeCardDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  modeStatusBoxAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginVertical: 4,
  },
  modeStatusTextAdmin: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
    flex: 1,
  },
  modeStatusBoxOwn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginVertical: 4,
  },
  modeStatusTextOwn: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
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
  keyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
  keyModeHint: {
    fontSize: 10,
    color: '#B45309',
    marginTop: 4,
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
  guideLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
});
