import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SupportFAQ, SupportArticle, SupportTicket, SupportMessage, SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_TOKEN_KEY } from '../services/supabase';

const { width } = Dimensions.get('window');
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUPPORT_CATEGORIES = [
  { id: 'general', label: 'General', icon: 'help-circle' },
  { id: 'technical', label: 'Technical', icon: 'settings' },
  { id: 'billing', label: 'Billing', icon: 'card' },
  { id: 'courses', label: 'Courses', icon: 'book' },
  { id: 'account', label: 'Account', icon: 'person' },
];

const FAQ_CATEGORIES = ['All', 'General', 'Technical', 'Billing', 'Courses', 'Account'];

const stripMarkdown = (text: string): string => {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^[\*\-\+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');
};

export default function SupportScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const aiChatScrollRef = useRef<ScrollView>(null);
  
  const [activeTab, setActiveTab] = useState<'articles' | 'faqs' | 'tickets'>('articles');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAIChatInFAQs, setShowAIChatInFAQs] = useState(false);
  const [selectedFAQCategory, setSelectedFAQCategory] = useState('All');
  
  const [articles, setArticles] = useState<SupportArticle[]>([]);
  const [faqs, setFAQs] = useState<SupportFAQ[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [loadingFAQs, setLoadingFAQs] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [showTicketChatModal, setShowTicketChatModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const [newTicketCategory, setNewTicketCategory] = useState('general');
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  
  const [chatMessage, setChatMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);

  useEffect(() => {
    loadArticles();
    loadFAQs();
    loadTickets();
  }, []);

  // Debounce search — apply only after 300 ms and minimum 2 chars
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.length >= 2 ? searchQuery : '');
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadArticles = async () => {
    setLoadingArticles(true);
    const result = await supabase.getSupportArticles();
    if (result.success && result.articles) {
      setArticles(result.articles);
    }
    setLoadingArticles(false);
  };

  const loadFAQs = async () => {
    setLoadingFAQs(true);
    const result = await supabase.getSupportFAQs();
    if (result.success && result.faqs) {
      setFAQs(result.faqs);
    }
    setLoadingFAQs(false);
  };

  const loadTickets = async () => {
    setLoadingTickets(true);
    const result = await supabase.getUserTickets();
    if (result.success && result.tickets) {
      setTickets(result.tickets);
    }
    setLoadingTickets(false);
  };

  const loadTicketMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    const result = await supabase.getTicketMessages(ticketId);
    if (result.success && result.messages) {
      setTicketMessages(result.messages);
    }
    setLoadingMessages(false);
  };

  const handleCreateTicket = async () => {
    if (!newTicketSubject.trim() || !newTicketMessage.trim()) return;
    
    setCreatingTicket(true);
    const result = await supabase.createSupportTicket(
      newTicketCategory,
      newTicketSubject.trim(),
      newTicketMessage.trim()
    );
    
    if (result.success) {
      setShowNewTicketModal(false);
      setNewTicketSubject('');
      setNewTicketMessage('');
      loadTickets();
    }
    setCreatingTicket(false);
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !selectedTicket) return;
    
    setSendingMessage(true);
    const result = await supabase.sendTicketMessage(selectedTicket.id, chatMessage.trim());
    
    if (result.success && result.message) {
      setTicketMessages(prev => [...prev, result.message!]);
      setChatMessage('');
    }
    setSendingMessage(false);
  };

  const openTicketChat = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    loadTicketMessages(ticket.id);
    setShowTicketChatModal(true);
  };

  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = selectedFAQCategory === 'All' || 
      faq.category.toLowerCase() === selectedFAQCategory.toLowerCase();
    const matchesSearch = !debouncedSearch || 
      faq.question.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      faq.answer.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredArticles = articles.filter(article => {
    return !debouncedSearch || 
      article.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      article.description.toLowerCase().includes(debouncedSearch.toLowerCase());
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#3B82F6';
      case 'in_progress': return '#F59E0B';
      case 'resolved': return '#10B981';
      case 'closed': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Open';
      case 'in_progress': return 'In Progress';
      case 'resolved': return 'Resolved';
      case 'closed': return 'Closed';
      default: return status;
    }
  };

  const getIconForArticle = (iconName: string) => {
    const iconMap: { [key: string]: keyof typeof Ionicons.glyphMap } = {
      'book': 'book-outline',
      'settings': 'settings-outline',
      'card': 'card-outline',
      'person': 'person-outline',
      'help': 'help-circle-outline',
      'rocket': 'rocket-outline',
      'shield': 'shield-outline',
      'notifications': 'notifications-outline',
    };
    return iconMap[iconName] || 'document-text-outline';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const sendAIMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;

    const userMessage: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: aiInput.trim(),
      timestamp: new Date(),
    };

    setAiMessages(prev => [...prev, userMessage]);
    setAiInput('');
    setAiLoading(true);
    setShowFeedback(false);

    try {
      const token = await supabase.getAccessToken();
      const messagesToSend = [...aiMessages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-support-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          messages: messagesToSend,
          ticketId: currentTicketId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const responseText = await response.text();
      let fullContent = '';

      // Parse SSE stream: data: {...} lines
      const lines = responseText.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) fullContent += chunk;
          // Support flat response format too
          if (!fullContent && parsed.content) fullContent = parsed.content;
        } catch {
          // skip malformed lines
        }
      }

      // Fallback: try parsing the entire body as JSON
      if (!fullContent) {
        try {
          const parsed = JSON.parse(responseText);
          fullContent = parsed.content || parsed.message || parsed.choices?.[0]?.message?.content || '';
        } catch {
          fullContent = responseText;
        }
      }

      if (!fullContent) throw new Error('Empty response from AI');

      const assistantMessage: AIChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date(),
      };
      setAiMessages(prev => [...prev, assistantMessage]);
      setShowFeedback(true);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: AIChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again or create a support ticket for human assistance.',
        timestamp: new Date(),
      };
      setAiMessages(prev => [...prev, errorMessage]);
    } finally {
      setAiLoading(false);
      setTimeout(() => {
        aiChatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleResolved = async () => {
    if (currentTicketId) {
      await supabase.sendTicketMessage(currentTicketId, 'Issue resolved via AI assistance.');
    }
    setAiMessages([]);
    setShowFeedback(false);
    setCurrentTicketId(null);
    setShowAIChatInFAQs(false);
  };

  const handleNeedHuman = async () => {
    const firstMessage = aiMessages.find(m => m.role === 'user')?.content || 'Support needed';
    const result = await supabase.createSupportTicket(
      'technical',
      firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : ''),
      aiMessages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n\n')
    );
    
    if (result.success && result.ticket) {
      setCurrentTicketId(result.ticket.id);
      loadTickets();
    }
    
    setAiMessages([]);
    setShowFeedback(false);
    setShowAIChatInFAQs(false);
    setActiveTab('tickets');
  };

  const renderAIAssistanceTab = () => (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.aiTabContainer}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      {aiMessages.length === 0 ? (
        <View style={styles.aiWelcome}>
          <LinearGradient
            colors={[`${colors.primary}20`, `${colors.primary}05`]}
            style={styles.aiWelcomeGradient}
          >
            <View style={styles.aiIconContainer}>
              <Ionicons name="sparkles" size={40} color={colors.primary} />
            </View>
            <Text style={styles.aiWelcomeTitle}>AI Support Assistant</Text>
            <Text style={styles.aiWelcomeSubtitle}>
              Get instant help with technical issues, account problems, payments, and more.
            </Text>
            <View style={styles.aiCapabilities}>
              {[
                { icon: 'key', text: 'Login & Account' },
                { icon: 'card', text: 'Payments' },
                { icon: 'settings', text: 'Technical Issues' },
                { icon: 'book', text: 'Course Access' },
              ].map((item, index) => (
                <View key={index} style={styles.aiCapabilityItem}>
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.primary} />
                  <Text style={styles.aiCapabilityText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>
      ) : (
        <ScrollView
          ref={aiChatScrollRef}
          style={styles.aiChatMessages}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.aiChatMessagesContent}
        >
          {aiMessages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.aiMessageContainer,
                message.role === 'user' && styles.aiUserMessageContainer,
              ]}
            >
              {message.role === 'assistant' && (
                <View style={styles.aiAvatarContainer}>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                </View>
              )}
              <View style={[
                styles.aiMessageBubble,
                message.role === 'user' ? styles.aiUserBubble : styles.aiAssistantBubble,
              ]}>
                <Text style={[
                  styles.aiMessageText,
                  message.role === 'user' && styles.aiUserMessageText,
                ]}>
                  {message.role === 'assistant' ? stripMarkdown(message.content) : message.content}
                </Text>
              </View>
            </View>
          ))}
          
          {aiLoading && (
            <View style={styles.aiMessageContainer}>
              <View style={styles.aiAvatarContainer}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
              </View>
              <View style={[styles.aiMessageBubble, styles.aiAssistantBubble, styles.aiTypingBubble]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.aiTypingText}>AI is thinking...</Text>
              </View>
            </View>
          )}
          
          {showFeedback && (
            <View style={styles.feedbackContainer}>
              <Text style={styles.feedbackTitle}>Did this resolve your issue?</Text>
              <View style={styles.feedbackButtons}>
                <TouchableOpacity
                  style={[styles.feedbackButton, styles.resolvedButton]}
                  onPress={handleResolved}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={[styles.feedbackButtonText, { color: '#10B981' }]}>Yes, Resolved</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackButton, styles.escalateButton]}
                  onPress={handleNeedHuman}
                >
                  <Ionicons name="arrow-up-circle" size={20} color="#F59E0B" />
                  <Text style={[styles.feedbackButtonText, { color: '#F59E0B' }]}>Need Human Support</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
      
      <View style={[styles.aiInputContainer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TextInput
          style={styles.aiTextInput}
          placeholder="Describe your issue..."
          placeholderTextColor="#9CA3AF"
          value={aiInput}
          onChangeText={setAiInput}
          multiline
          maxLength={500}
          editable={!aiLoading}
        />
        <TouchableOpacity
          style={[styles.aiSendButton, (!aiInput.trim() || aiLoading) && styles.aiSendButtonDisabled]}
          onPress={sendAIMessage}
          disabled={!aiInput.trim() || aiLoading}
        >
          {aiLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  const renderArticlesTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {loadingArticles ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : filteredArticles.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={60} color="#D1D5DB" />
          <Text style={styles.emptyStateText}>No articles found</Text>
        </View>
      ) : (
        filteredArticles.map((article) => (
          <TouchableOpacity
            key={article.id}
            style={styles.articleCard}
            onPress={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
            activeOpacity={0.7}
          >
            <View style={styles.articleHeader}>
              <View style={styles.articleIconContainer}>
                <Ionicons 
                  name={getIconForArticle(article.icon_name)} 
                  size={24} 
                  color={colors.primary} 
                />
              </View>
              <View style={styles.articleInfo}>
                <Text style={styles.articleTitle}>{article.title}</Text>
                <Text style={styles.articleDescription} numberOfLines={expandedArticle === article.id ? undefined : 2}>
                  {stripMarkdown(article.description)}
                </Text>
              </View>
              <Ionicons 
                name={expandedArticle === article.id ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color="#9CA3AF" 
              />
            </View>
            
            {expandedArticle === article.id && (
              <View style={styles.articleContent}>
                <Text style={styles.articleContentText}>{stripMarkdown(article.content)}</Text>
                <View style={styles.articleFeedback}>
                  <Text style={styles.feedbackLabel}>Was this helpful?</Text>
                  <View style={styles.feedbackButtons}>
                    <TouchableOpacity 
                      style={styles.feedbackButton}
                      onPress={() => supabase.submitArticleFeedback(article.id, true)}
                    >
                      <Ionicons name="thumbs-up-outline" size={18} color="#10B981" />
                      <Text style={[styles.feedbackButtonText, { color: '#10B981' }]}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.feedbackButton}
                      onPress={() => supabase.submitArticleFeedback(article.id, false)}
                    >
                      <Ionicons name="thumbs-down-outline" size={18} color="#EF4444" />
                      <Text style={[styles.feedbackButtonText, { color: '#EF4444' }]}>No</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderFAQsTab = () => {
    if (showAIChatInFAQs) {
      return (
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.backToFAQsBtn}
            onPress={() => {
              setShowAIChatInFAQs(false);
              setAiMessages([]);
              setShowFeedback(false);
            }}
          >
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backToFAQsText}>Back to FAQs</Text>
          </TouchableOpacity>
          {renderAIAssistanceTab()}
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {FAQ_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryChip,
                selectedFAQCategory === category && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedFAQCategory(category)}
            >
              <Text style={[
                styles.categoryChipText,
                selectedFAQCategory === category && styles.categoryChipTextActive,
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <ScrollView style={styles.faqList} showsVerticalScrollIndicator={false}>
          {loadingFAQs ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : filteredFAQs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="help-circle-outline" size={60} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No FAQs found</Text>
            </View>
          ) : (
            filteredFAQs.map((faq) => (
              <TouchableOpacity
                key={faq.id}
                style={styles.faqCard}
                onPress={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                activeOpacity={0.7}
              >
                <View style={styles.faqHeader}>
                  <Text style={styles.faqQuestion}>{faq.question}</Text>
                  <Ionicons 
                    name={expandedFAQ === faq.id ? 'chevron-up' : 'chevron-down'} 
                    size={20} 
                    color="#9CA3AF" 
                  />
                </View>
                {expandedFAQ === faq.id && (
                  <Text style={styles.faqAnswer}>{stripMarkdown(faq.answer)}</Text>
                )}
              </TouchableOpacity>
            ))
          )}

          {/* Still need help? — opens AI chat within this tab */}
          <View style={styles.stillNeedHelp}>
            <Ionicons name="chatbubbles-outline" size={28} color={colors.primary} />
            <Text style={styles.stillNeedHelpTitle}>Still need help?</Text>
            <Text style={styles.stillNeedHelpSubtitle}>
              Chat with our AI assistant for instant answers or raise a support ticket.
            </Text>
            <TouchableOpacity
              style={styles.askAIBtn}
              onPress={() => setShowAIChatInFAQs(true)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.primary, '#4ADE80']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.askAIBtnGradient}
              >
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.askAIBtnText}>Ask AI Assistant</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createTicketLink}
              onPress={() => setShowNewTicketModal(true)}
            >
              <Text style={styles.createTicketLinkText}>Create a support ticket instead →</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  };

  const renderTicketsTab = () => (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={styles.newTicketButton}
        onPress={() => setShowNewTicketModal(true)}
      >
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.newTicketGradient}
        >
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.newTicketButtonText}>Create New Ticket</Text>
        </LinearGradient>
      </TouchableOpacity>
      
      <ScrollView style={styles.ticketList} showsVerticalScrollIndicator={false}>
        {loadingTickets ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : tickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={60} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No support tickets yet</Text>
            <Text style={styles.emptyStateSubtext}>Create a ticket to get help from our team</Text>
          </View>
        ) : (
          tickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={styles.ticketCard}
              onPress={() => openTicketChat(ticket)}
              activeOpacity={0.7}
            >
              <View style={styles.ticketHeader}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(ticket.status) }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>
                    {getStatusLabel(ticket.status)}
                  </Text>
                </View>
                <Text style={styles.ticketDate}>{formatDate(ticket.created_at)}</Text>
              </View>
              <Text style={styles.ticketSubject}>{ticket.subject}</Text>
              <View style={styles.ticketFooter}>
                <View style={styles.ticketCategory}>
                  <Ionicons name="folder-outline" size={14} color="#9CA3AF" />
                  <Text style={styles.ticketCategoryText}>{ticket.category}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80', '#22C55E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top }]}
      >
        <View style={styles.headerTop}>
          <View style={{ width: 36 }} />
          <Text style={styles.headerTitle}>Support</Text>
          <HeaderMenuButton onPress={openSidebar} />
        </View>
        
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for help..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <View style={styles.tabBar}>
        {[
          { id: 'articles', label: 'Articles', icon: 'document-text' },
          { id: 'faqs', label: 'FAQs', icon: 'help-circle' },
          { id: 'tickets', label: 'My Tickets', icon: 'ticket' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabButton, activeTab === tab.id && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab(tab.id as typeof activeTab);
              if (tab.id !== 'faqs') setShowAIChatInFAQs(false);
            }}
          >
            <Ionicons 
              name={(activeTab === tab.id ? tab.icon : `${tab.icon}-outline`) as keyof typeof Ionicons.glyphMap} 
              size={18} 
              color={activeTab === tab.id ? colors.primary : '#6B7280'} 
            />
            <Text style={[styles.tabButtonText, activeTab === tab.id && styles.tabButtonTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'articles' && renderArticlesTab()}
      {activeTab === 'faqs' && renderFAQsTab()}
      {activeTab === 'tickets' && renderTicketsTab()}

      <Modal
        visible={showNewTicketModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewTicketModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Ticket</Text>
              <TouchableOpacity onPress={() => setShowNewTicketModal(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.categorySelect}
              >
                {SUPPORT_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryOption,
                      newTicketCategory === cat.id && styles.categoryOptionActive,
                    ]}
                    onPress={() => setNewTicketCategory(cat.id)}
                  >
                    <Ionicons 
                      name={(cat.icon + (newTicketCategory === cat.id ? '' : '-outline')) as keyof typeof Ionicons.glyphMap}
                      size={20} 
                      color={newTicketCategory === cat.id ? '#FFFFFF' : '#6B7280'} 
                    />
                    <Text style={[
                      styles.categoryOptionText,
                      newTicketCategory === cat.id && styles.categoryOptionTextActive,
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.inputLabel}>Subject</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Brief description of your issue"
                placeholderTextColor="#9CA3AF"
                value={newTicketSubject}
                onChangeText={setNewTicketSubject}
              />
              
              <Text style={styles.inputLabel}>Message</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe your issue in detail..."
                placeholderTextColor="#9CA3AF"
                value={newTicketMessage}
                onChangeText={setNewTicketMessage}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </ScrollView>
            
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!newTicketSubject.trim() || !newTicketMessage.trim()) && styles.submitButtonDisabled,
              ]}
              onPress={handleCreateTicket}
              disabled={!newTicketSubject.trim() || !newTicketMessage.trim() || creatingTicket}
            >
              {creatingTicket ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Ticket</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showTicketChatModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTicketChatModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatModalOverlay}
        >
          <View style={styles.chatModalContent}>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={() => setShowTicketChatModal(false)}>
                <Ionicons name="arrow-back" size={24} color="#374151" />
              </TouchableOpacity>
              <View style={styles.chatHeaderInfo}>
                <Text style={styles.chatHeaderTitle} numberOfLines={1}>
                  {selectedTicket?.subject}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedTicket?.status || 'open') + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(selectedTicket?.status || 'open') }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(selectedTicket?.status || 'open'), fontSize: 11 }]}>
                    {getStatusLabel(selectedTicket?.status || 'open')}
                  </Text>
                </View>
              </View>
            </View>
            
            <ScrollView style={styles.chatMessages}>
              {loadingMessages ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
              ) : (
                ticketMessages.map((message) => (
                  <View 
                    key={message.id}
                    style={[
                      styles.messageContainer,
                      message.sender_type === 'user' && styles.userMessageContainer,
                    ]}
                  >
                    {message.sender_type !== 'user' && (
                      <View style={styles.senderAvatar}>
                        <Ionicons 
                          name={message.sender_type === 'ai' ? 'sparkles' : 'person'} 
                          size={16} 
                          color={colors.primary} 
                        />
                      </View>
                    )}
                    <View style={[
                      styles.messageBubble,
                      message.sender_type === 'user' ? styles.userMessage : styles.otherMessage,
                    ]}>
                      <Text style={[
                        styles.messageText,
                        message.sender_type === 'user' && styles.userMessageText,
                      ]}>
                        {message.content}
                      </Text>
                      <Text style={[
                        styles.messageTime,
                        message.sender_type === 'user' && styles.userMessageTime,
                      ]}>
                        {new Date(message.created_at).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            
            {selectedTicket?.status !== 'closed' && (
              <View style={styles.chatInputContainer}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Type your message..."
                  placeholderTextColor="#9CA3AF"
                  value={chatMessage}
                  onChangeText={setChatMessage}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendButton, !chatMessage.trim() && styles.sendButtonDisabled]}
                  onPress={handleSendMessage}
                  disabled={!chatMessage.trim() || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: '#374151',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: 6,
    borderRadius: borderRadius.md,
  },
  tabButtonActive: {
    backgroundColor: `${colors.primary}10`,
  },
  tabButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabButtonTextActive: {
    color: colors.primary,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  articleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  articleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${colors.primary}10`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleInfo: {
    flex: 1,
  },
  articleTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  articleDescription: {
    fontSize: fontSize.sm,
    color: '#6B7280',
    lineHeight: 20,
  },
  articleContent: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  articleContentText: {
    fontSize: fontSize.sm,
    color: '#374151',
    lineHeight: 22,
  },
  articleFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  feedbackLabel: {
    fontSize: fontSize.sm,
    color: '#6B7280',
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F3F4F6',
  },
  feedbackButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  categoryScroll: {
    marginTop: spacing.md,
    flexGrow: 0,
  },
  categoryScrollContent: {
    alignItems: 'center',
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: '#F3F4F6',
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    color: '#6B7280',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  faqList: {
    flex: 1,
    marginTop: spacing.sm,
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: spacing.sm,
  },
  faqAnswer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    fontSize: fontSize.sm,
    color: '#6B7280',
    lineHeight: 22,
  },
  ticketList: {
    flex: 1,
  },
  newTicketButton: {
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  newTicketGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  newTicketButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  ticketDate: {
    fontSize: fontSize.xs,
    color: '#9CA3AF',
  },
  ticketSubject: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: spacing.sm,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ticketCategoryText: {
    fontSize: fontSize.sm,
    color: '#9CA3AF',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: spacing.md,
  },
  emptyStateSubtext: {
    fontSize: fontSize.sm,
    color: '#9CA3AF',
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalBody: {
    padding: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#374151',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  categorySelect: {
    marginBottom: spacing.sm,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F3F4F6',
    marginRight: spacing.sm,
    gap: 6,
  },
  categoryOptionActive: {
    backgroundColor: colors.primary,
  },
  categoryOptionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: '#6B7280',
  },
  categoryOptionTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: '#374151',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chatModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chatModalContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginTop: 40,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: spacing.md,
  },
  chatHeaderInfo: {
    flex: 1,
    gap: 4,
  },
  chatHeaderTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#1F2937',
  },
  chatMessages: {
    flex: 1,
    padding: spacing.md,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  userMessage: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: fontSize.md,
    color: '#374151',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: fontSize.xs,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'right',
  },
  userMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: '#374151',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  aiTabContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  aiWelcome: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  aiWelcomeGradient: {
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
  },
  aiIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  aiWelcomeTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  aiWelcomeSubtitle: {
    fontSize: fontSize.md,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  aiCapabilities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  aiCapabilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  aiCapabilityText: {
    fontSize: fontSize.sm,
    color: '#374151',
    fontWeight: '500',
  },
  aiChatMessages: {
    flex: 1,
  },
  aiChatMessagesContent: {
    padding: spacing.md,
  },
  aiMessageContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-end',
  },
  aiUserMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiAvatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  aiMessageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  aiUserBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
    marginLeft: 'auto',
  },
  aiAssistantBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aiMessageText: {
    fontSize: fontSize.md,
    color: '#374151',
    lineHeight: 22,
  },
  aiUserMessageText: {
    color: '#FFFFFF',
  },
  aiTypingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiTypingText: {
    fontSize: fontSize.sm,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  feedbackContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  feedbackTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#374151',
    marginBottom: spacing.md,
  },
  resolvedButton: {
    backgroundColor: '#10B98110',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  escalateButton: {
    backgroundColor: '#F59E0B10',
    borderColor: '#F59E0B',
    borderWidth: 1,
  },
  aiInputContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  aiTextInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: '#374151',
    maxHeight: 100,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aiSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSendButtonDisabled: {
    opacity: 0.5,
  },

  backToFAQsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  backToFAQsText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },

  stillNeedHelp: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  stillNeedHelpTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  stillNeedHelpSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  askAIBtn: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  askAIBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  askAIBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  createTicketLink: {
    paddingVertical: 4,
  },
  createTicketLinkText: {
    fontSize: 13,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
