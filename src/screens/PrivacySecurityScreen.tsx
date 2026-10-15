import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

const PRIMARY = '#2BBD6E';

const SECTIONS = [
  {
    id: 1,
    title: 'Information We Collect',
    icon: 'server-outline' as const,
    content: [
      {
        heading: 'Information You Provide',
        bullets: [
          'Full name, email address, and phone number',
          'Password (stored in encrypted form)',
          'Profile picture',
          'Payment and billing information',
          'Course progress and quiz answers',
          'Forum posts and discussion contributions',
        ],
      },
      {
        heading: 'Information Collected Automatically',
        bullets: [
          'Device information (model, OS version, unique device identifiers)',
          'Usage data (screens visited, features used, time spent)',
          'IP address and general location',
          'Cookies and similar tracking technologies',
          'Log data (crash reports, error logs, timestamps)',
        ],
      },
    ],
  },
  {
    id: 2,
    title: 'How We Use Your Information',
    icon: 'eye-outline' as const,
    content: [
      {
        heading: 'Primary Uses',
        bullets: [
          'Provide, maintain, and improve our educational services',
          'Process transactions and send related information',
          'Personalize your learning experience and content recommendations',
          'Track your learning progress and generate performance insights',
          'Send notifications about courses, updates, and promotions',
          'Provide customer support and respond to your inquiries',
          'Detect, investigate, and prevent fraudulent or unauthorized activity',
          'Comply with legal obligations and enforce our policies',
          'Conduct analytics to understand how our platform is used',
        ],
      },
    ],
  },
  {
    id: 3,
    title: 'Information Sharing',
    icon: 'share-social-outline' as const,
    content: [
      {
        heading: 'When We Share Information',
        bullets: [
          'Service providers — payment processors, hosting providers, analytics platforms acting on our behalf',
          'Instructors — limited progress data to help them improve course delivery',
          'Legal requirements — when required by law, court order, or governmental authority',
          'Business transfers — in connection with a merger, acquisition, or sale of assets',
          'With your consent — when you explicitly authorize us to share your information',
        ],
      },
      {
        heading: 'Our Commitment',
        text: 'We do not sell, rent, or trade your personal information to third parties for their marketing purposes.',
      },
    ],
  },
  {
    id: 4,
    title: 'Data Security',
    icon: 'lock-closed-outline' as const,
    content: [
      {
        heading: 'Security Measures',
        bullets: [
          'Encryption of data in transit using TLS/SSL protocols',
          'Encryption of sensitive data at rest',
          'Secure authentication mechanisms including OTP and OAuth',
          'Regular security audits and vulnerability assessments',
          'Role-based access controls for internal staff',
          'Secure, certified data centers with physical security controls',
        ],
      },
      {
        heading: 'Important Notice',
        text: 'While we implement industry-standard security measures, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security of your data.',
      },
    ],
  },
  {
    id: 5,
    title: 'Cookies & Tracking',
    icon: 'nutrition-outline' as const,
    content: [
      {
        heading: 'How We Use Cookies',
        bullets: [
          'Maintain your login session and authentication state',
          'Understand how you use our platform to improve your experience',
          'Personalize content and course recommendations',
          'Analytics to measure platform performance and usage patterns',
          'Serve relevant advertisements on third-party platforms',
        ],
      },
      {
        heading: 'Your Control',
        text: 'You can control and manage cookies through your browser or device settings. Disabling certain cookies may limit some functionality of our platform.',
      },
    ],
  },
  {
    id: 6,
    title: 'Third-Party Services',
    icon: 'people-outline' as const,
    content: [
      {
        heading: 'Services We Use',
        bullets: [
          'Razorpay and PhonePe — payment processing',
          'Google Analytics — usage analytics and insights',
          'Cloud infrastructure providers — data hosting and storage',
          'Email and SMS service providers — communications and OTP delivery',
        ],
      },
      {
        heading: 'Third-Party Privacy',
        text: 'These third-party services have their own privacy policies. We are not responsible for the privacy practices of these services and encourage you to review their policies.',
      },
    ],
  },
  {
    id: 7,
    title: "Children's Privacy",
    icon: 'checkmark-circle-outline' as const,
    content: [
      {
        heading: 'Age Requirements',
        bullets: [
          'Our platform is intended for users aged 13 and above',
          'Users under the age of 18 should obtain parental consent before using our services',
          'We do not knowingly collect personal information from children under 13',
        ],
      },
      {
        heading: 'If You Believe a Child Has Used Our Service',
        text: 'If you believe that a child under 13 has provided us with personal information without appropriate consent, please contact us immediately at privacy@simplelecture.com and we will take prompt steps to delete such information.',
      },
    ],
  },
  {
    id: 8,
    title: 'Data Retention',
    icon: 'time-outline' as const,
    content: [
      {
        heading: 'How Long We Keep Your Data',
        text: 'We retain your personal information for as long as your account is active or as needed to provide you with our services. We also retain data as necessary to comply with legal obligations, resolve disputes, and enforce our agreements.',
      },
      {
        heading: 'Account Deletion',
        text: 'When you delete your account, we will delete or anonymize your personal information within a reasonable timeframe, except where retention is required by law or for legitimate business purposes.',
      },
    ],
  },
  {
    id: 9,
    title: 'Your Rights',
    icon: 'shield-outline' as const,
    content: [
      {
        heading: 'Rights You Have Over Your Data',
        bullets: [
          'Access — request a copy of the personal information we hold about you',
          'Correction — request correction of inaccurate or incomplete data',
          'Deletion — request deletion of your personal information',
          'Portability — receive your data in a structured, machine-readable format',
          'Opt-out — opt out of marketing communications at any time',
          'Withdraw consent — withdraw consent for processing where consent is the legal basis',
        ],
      },
      {
        heading: 'Exercising Your Rights',
        text: 'To exercise any of these rights, please contact us at privacy@simplelecture.com. We will respond to your request within 30 days.',
      },
    ],
  },
  {
    id: 10,
    title: 'Changes to Policy',
    icon: 'refresh-outline' as const,
    content: [
      {
        heading: 'Policy Updates',
        text: 'We may update this Privacy Policy from time to time to reflect changes in our practices, technologies, or legal requirements. The updated policy will be posted on this page with a revised "Last Updated" date.',
      },
      {
        heading: 'Notification of Significant Changes',
        text: 'For significant changes that materially affect how we handle your personal information, we will notify you via email or through a prominent notice on our platform before the changes take effect.',
      },
    ],
  },
  {
    id: 11,
    title: 'Contact Information',
    icon: 'mail-outline' as const,
    isContact: true,
    content: [],
  },
];

interface SectionContent {
  heading?: string;
  bullets?: string[];
  text?: string;
}

interface Section {
  id: number;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  content: SectionContent[];
  isContact?: boolean;
}

export default function PrivacySecurityScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<number, number>>({});

  const scrollToSection = (id: number) => {
    const offset = sectionOffsets[id];
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: offset - 16, animated: true });
    }
  };

  const handleSectionLayout = (id: number, y: number) => {
    setSectionOffsets(prev => ({ ...prev, [id]: y }));
  };

  const renderContent = (content: SectionContent[]) =>
    content.map((block, bi) => (
      <View key={bi} style={styles.block}>
        {block.heading && <Text style={styles.blockHeading}>{block.heading}</Text>}
        {block.bullets?.map((bullet, idx) => (
          <View key={idx} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
        {block.text && <Text style={styles.blockText}>{block.text}</Text>}
      </View>
    ));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={[PRIMARY, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="shield-checkmark" size={22} color="#fff" />
          <Text style={styles.headerTitle}>Privacy Policy</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Company Info */}
        <View style={styles.companyCard}>
          <Text style={styles.companyName}>KRUPA KNOWLEDGE STORE PRIVATE LIMITED (OPC)</Text>
          <Text style={styles.companyOpAs}>Operating as SimpleLecture</Text>
          <View style={styles.updatedRow}>
            <Ionicons name="calendar-outline" size={14} color="#6B7280" />
            <Text style={styles.updatedText}>Last Updated: February 6, 2025</Text>
          </View>
        </View>

        {/* Table of Contents */}
        <View style={styles.tocCard}>
          <Text style={styles.tocTitle}>Table of Contents</Text>
          {(SECTIONS as Section[]).map(section => (
            <TouchableOpacity
              key={section.id}
              style={styles.tocRow}
              onPress={() => scrollToSection(section.id)}
              activeOpacity={0.7}
            >
              <View style={styles.tocIconWrap}>
                <Ionicons name={section.icon} size={16} color={PRIMARY} />
              </View>
              <Text style={styles.tocRowNum}>{section.id}.</Text>
              <Text style={styles.tocRowText}>{section.title}</Text>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sections */}
        {(SECTIONS as Section[]).map(section => (
          <View
            key={section.id}
            style={styles.sectionCard}
            onLayout={e => handleSectionLayout(section.id, e.nativeEvent.layout.y)}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name={section.icon} size={20} color={PRIMARY} />
              </View>
              <Text style={styles.sectionNum}>{section.id}.</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            {section.isContact ? (
              <View style={styles.contactBlock}>
                <ContactRow icon="shield-outline" label="Data Protection Officer" value="privacy@simplelecture.com" onPress={() => Linking.openURL('mailto:privacy@simplelecture.com')} />
                <ContactRow icon="mail-outline" label="General Enquiries" value="contact@simplelecture.com" onPress={() => Linking.openURL('mailto:contact@simplelecture.com')} />
                <ContactRow icon="call-outline" label="Phone" value="+91 73530 21234" onPress={() => Linking.openURL('tel:+917353021234')} />
                <ContactRow icon="location-outline" label="Address" value="Koramangala, Bangalore, Karnataka, India" />
                <TouchableOpacity
                  style={styles.termsLink}
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL('https://simplelecture.com/terms-and-conditions')}
                >
                  <Ionicons name="document-text-outline" size={16} color={PRIMARY} />
                  <Text style={styles.termsLinkText}>View Terms & Conditions</Text>
                </TouchableOpacity>
              </View>
            ) : (
              renderContent(section.content)
            )}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.contactRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={styles.contactIconWrap}>
        <Ionicons name={icon} size={18} color={PRIMARY} />
      </View>
      <View style={styles.contactText}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={[styles.contactValue, onPress && styles.contactValueLink]}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  scrollContent: { padding: 16 },

  companyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  companyName: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20 },
  companyOpAs: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  updatedText: { fontSize: 12, color: '#6B7280' },

  tocCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tocTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tocIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${PRIMARY}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tocRowNum: { fontSize: 13, color: '#6B7280', minWidth: 20 },
  tocRowText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${PRIMARY}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionNum: { fontSize: 16, fontWeight: '800', color: PRIMARY },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },

  block: { marginBottom: 14 },
  blockHeading: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 20 },
  blockText: { fontSize: 13, color: '#4B5563', lineHeight: 20 },

  contactBlock: { gap: 4 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  contactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${PRIMARY}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactText: { flex: 1 },
  contactLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  contactValue: { fontSize: 13, color: '#111827', fontWeight: '500' },
  contactValueLink: { color: PRIMARY },
  termsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: `${PRIMARY}10`,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${PRIMARY}30`,
  },
  termsLinkText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
});
