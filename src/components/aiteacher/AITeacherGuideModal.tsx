import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../../constants/theme';
import { loadPrefs, savePrefs } from '../../services/aiTeacherPrefs';
import { testGeminiApiKey } from '../../services/aiTeacherService';
import { KeyboardShiftView } from '../keyboard/keyboardStick';

interface AITeacherGuideModalProps {
  visible: boolean;
  onClose: () => void;
  defaultTab?: 'how-to-use' | 'api-key';
}

export function AITeacherGuideModal({
  visible,
  onClose,
  defaultTab = 'how-to-use',
}: AITeacherGuideModalProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'how-to-use' | 'api-key'>(defaultTab);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPrefs().then((p) => {
        setApiKey(p.apiKey || '');
        setTestResult(null);
        setSaveSuccess(false);
        setActiveTab(defaultTab);
      });
    }
  }, [visible, defaultTab]);

  const handleTestKey = async () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) return;
    setTesting(true);
    setTestResult(null);
    const result = await testGeminiApiKey(cleanKey);
    setTestResult(result);
    setTesting(false);
  };

  const handleSaveKey = async () => {
    const cleanKey = apiKey.trim();
    const current = await loadPrefs();
    await savePrefs({ ...current, apiKey: cleanKey });
    setSaveSuccess(true);
    setTestResult(null);
  };

  const handleRemoveKey = async () => {
    const current = await loadPrefs();
    await savePrefs({ ...current, apiKey: '' });
    setApiKey('');
    setSaveSuccess(false);
    setTestResult(null);
  };

  const openAiStudio = () => {
    Linking.openURL('https://aistudio.google.com/apikey');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardShiftView style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Ionicons name="book" size={22} color={colors.primary} />
              <Text style={styles.headerTitle}>AI Teacher Guide</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'how-to-use' && styles.tabBtnActive]}
              onPress={() => setActiveTab('how-to-use')}
            >
              <Ionicons
                name="bulb-outline"
                size={16}
                color={activeTab === 'how-to-use' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'how-to-use' && styles.tabBtnTextActive,
                ]}
              >
                How to Use
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'api-key' && styles.tabBtnActive]}
              onPress={() => setActiveTab('api-key')}
            >
              <Ionicons
                name="key-outline"
                size={16}
                color={activeTab === 'api-key' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'api-key' && styles.tabBtnTextActive,
                ]}
              >
                Create & Set Key
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {activeTab === 'how-to-use' ? (
              <View style={styles.tabContent}>
                {/* Intro Card */}
                <View style={styles.introCard}>
                  <Text style={styles.introTitle}>What is 1-to-1 Personal AI Teacher?</Text>
                  <Text style={styles.introDesc}>
                    Your AI Teacher is an interactive personal tutor that talks with you out loud, clears doubts, provides step-by-step concept explanations, and asks practice questions grounded in your syllabus.
                  </Text>
                </View>

                {/* Steps */}
                <View style={styles.stepCard}>
                  <View style={styles.stepNumCircle}>
                    <Text style={styles.stepNumText}>1</Text>
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepTitle}>Interactive Voice Teacher</Text>
                    <Text style={styles.stepDesc}>
                      Switch to "Voice Teacher" and tap "Start Voice Class" or speak your doubt. The teacher will respond with high-quality natural voice and interactive dialogue.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepCard}>
                  <View style={styles.stepNumCircle}>
                    <Text style={styles.stepNumText}>2</Text>
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepTitle}>24/7 Chat Teacher</Text>
                    <Text style={styles.stepDesc}>
                      Switch to "Chat" anytime to type questions silently. Ask conceptual doubts, request formulas, summaries, and exam-focused notes.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepCard}>
                  <View style={styles.stepNumCircle}>
                    <Text style={styles.stepNumText}>3</Text>
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepTitle}>Multi-Subject & Multi-Lingual</Text>
                    <Text style={styles.stepDesc}>
                      Tell the teacher which of your enrolled subjects you'd like to study. The AI Teacher understands and speaks in English, Hindi, and Kannada.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepCard}>
                  <View style={styles.stepNumCircle}>
                    <Text style={styles.stepNumText}>4</Text>
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepTitle}>Two Flexible Access Plans</Text>
                    <Text style={styles.stepDesc}>
                      • <Text style={styles.bold}>Pro Plan (₹1,000)</Text>: All-inclusive with built-in AI quota. Optional personal API key support for higher limits.{'\n'}
                      • <Text style={styles.bold}>Plus Plan (₹500)</Text>: Affordable plan using your own free Google Gemini API key.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.tabContent}>
                {/* How to get free key */}
                <View style={styles.keyGuideCard}>
                  <View style={styles.keyGuideHeader}>
                    <Ionicons name="key" size={18} color="#D97706" />
                    <Text style={styles.keyGuideTitle}>How to Get Free Google Gemini API Key</Text>
                  </View>

                  <Text style={styles.guideStep}>
                    1. Go to <Text style={styles.linkText} onPress={openAiStudio}>aistudio.google.com/apikey</Text> in your browser and sign in with any Google account (no credit card required).
                  </Text>
                  <Text style={styles.guideStep}>
                    2. Tap the blue <Text style={styles.bold}>"Create API key"</Text> button.
                  </Text>
                  <Text style={styles.guideStep}>
                    3. Select <Text style={styles.bold}>"Create API key in new project"</Text>. Google generates your key in 2 seconds.
                  </Text>
                  <Text style={styles.guideStep}>
                    4. Tap the copy icon to copy your key (starts with <Text style={styles.codeText}>AIzaSy...</Text>).
                  </Text>
                  <Text style={styles.guideStep}>
                    5. Paste it in the input below and tap <Text style={styles.bold}>"Save Key"</Text>.
                  </Text>

                  <TouchableOpacity style={styles.openStudioBtn} onPress={openAiStudio}>
                    <Text style={styles.openStudioBtnText}>Open Google AI Studio</Text>
                    <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* API Key Form */}
                <View style={styles.keyInputSection}>
                  <Text style={styles.inputSectionTitle}>Set Your Gemini API Key</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.keyInput, styles.monoInput]}
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChangeText={(t) => {
                        setApiKey(t);
                        setSaveSuccess(false);
                        setTestResult(null);
                      }}
                      secureTextEntry={!showKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowKey(!showKey)}
                    >
                      <Ionicons
                        name={showKey ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.saveBtn]}
                      disabled={!apiKey.trim()}
                      onPress={handleSaveKey}
                    >
                      <Text style={styles.saveBtnText}>Save Key</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.testBtn]}
                      disabled={!apiKey.trim() || testing}
                      onPress={handleTestKey}
                    >
                      {testing ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.testBtnText}>Test Key</Text>
                      )}
                    </TouchableOpacity>

                    {apiKey.trim() !== '' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.removeBtn]}
                        onPress={handleRemoveKey}
                      >
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {saveSuccess && (
                    <View style={styles.msgSuccess}>
                      <Ionicons name="checkmark-circle" size={16} color="#059669" />
                      <Text style={styles.msgSuccessText}>
                        API Key saved successfully! Your AI Teacher is ready.
                      </Text>
                    </View>
                  )}

                  {testResult && (
                    <View
                      style={[
                        styles.msgBox,
                        testResult.ok ? styles.msgSuccess : styles.msgError,
                      ]}
                    >
                      <Ionicons
                        name={testResult.ok ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={testResult.ok ? '#059669' : '#DC2626'}
                      />
                      <Text
                        style={[
                          styles.msgText,
                          testResult.ok ? styles.msgSuccessText : styles.msgErrorText,
                        ]}
                      >
                        {testResult.message}
                      </Text>
                    </View>
                  )}

                  <View style={styles.privacyNote}>
                    <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                    <Text style={styles.privacyNoteText}>
                      Your API key is stored safely on this phone and sent directly to Google. Our servers never receive or store your personal key.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
              <Text style={styles.closeFooterBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardShiftView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  scrollArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  tabContent: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  introCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  introTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 4,
  },
  introDesc: {
    fontSize: fontSize.xs,
    color: '#047857',
    lineHeight: 18,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  stepNumCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  stepTextWrap: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  stepDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  keyGuideCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: 8,
  },
  keyGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  keyGuideTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#B45309',
  },
  guideStep: {
    fontSize: fontSize.xs,
    color: '#92400E',
    lineHeight: 18,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  codeText: {
    fontFamily: 'monospace',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    borderRadius: 4,
    color: '#B45309',
    fontWeight: '700',
  },
  openStudioBtn: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: 9,
    marginTop: 6,
  },
  openStudioBtnText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  keyInputSection: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  inputSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  inputRow: {
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
    paddingVertical: 8,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  monoInput: {
    fontFamily: 'monospace',
  },
  eyeBtn: {
    paddingHorizontal: spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: colors.primary,
  },
  saveBtnText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  testBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  testBtnText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  removeBtn: {
    backgroundColor: 'transparent',
  },
  removeBtnText: {
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  msgBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  msgSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  msgSuccessText: {
    fontSize: fontSize.xs,
    color: '#065F46',
    flex: 1,
  },
  msgError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  msgErrorText: {
    fontSize: fontSize.xs,
    color: '#B91C1C',
    flex: 1,
  },
  msgText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  privacyNoteText: {
    fontSize: 10,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 14,
  },
  footerRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    alignItems: 'flex-end',
  },
  closeFooterBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeFooterBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
