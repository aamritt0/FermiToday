import React, { useState, useEffect, useRef } from 'react';
import {
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  Animated,
  StatusBar,
  RefreshControl,
  Switch,
  ScrollView,
  Modal,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import axios from 'axios';

const BACKEND_URL = 'https://purring-celesta-fermitoday-f00679ea.koyeb.app'; 

type Event = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
};

// Helper function to extract class from event summary
const extractClassFromSummary = (summary: string): string | null => {
  const classMatch = summary.match(/CLASSE\s+([A-Z0-9]+)\s/);
  return classMatch ? classMatch[1] : null;
};

// Helper function to extract professor name from event summary
const extractProfessorFromSummary = (summary: string): string[] => {
  // Match all instances of PROF. or PROF.ssa followed by name
  // This regex looks for PROF or PROF.ssa, optional spaces/dots, then captures uppercase letters/spaces until a non-letter character
  const profMatches = [...summary.matchAll(/PROF\.?(?:ssa)?\.?\s*([A-Z][A-Z\s]+?)(?=\s*[\(\),]|\s+ASSENTE|\s+CLASSE|\s*$)/gi)];
  const professors: string[] = [];
  
  for (const match of profMatches) {
    if (match[1]) {
      const profName = match[1].trim().replace(/\s+/g, ' ');
      if (profName.length > 0) {
        professors.push(profName);
      }
    }
  }
  
  return professors;
};

// Helper function to filter events by class
const filterEventsByClass = (events: Event[], classCode: string): Event[] => {
  const upperClassCode = classCode.toUpperCase().trim();
  return events.filter(event => {
    const extractedClass = extractClassFromSummary(event.summary);
    return extractedClass === upperClassCode;
  });
};

// Helper function to filter events by professor
const filterEventsByProfessor = (events: Event[], professorName: string): Event[] => {
  const upperProfName = professorName.toUpperCase().trim();
  return events.filter(event => {
    const extractedProfs = extractProfessorFromSummary(event.summary);
    if (extractedProfs.length === 0) return false;
    
    // Check if any of the extracted professor names match exactly
    return extractedProfs.some(prof => prof.toUpperCase() === upperProfName);
  });
};

const EventCard = React.memo(({ item, index, isDark }: { item: Event; index: number; isDark: boolean }) => {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 400,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [index]);

  const cardStyle = isDark ? styles.eventCardDark : styles.eventCard;
  const summaryStyle = isDark ? styles.summaryDark : styles.summary;
  const descriptionStyle = isDark ? styles.descriptionDark : styles.description;
  const timeContainerStyle = isDark ? styles.timeContainerDark : styles.timeContainer;
  const timeTextStyle = isDark ? styles.timeTextDark : styles.timeText;

  const iconColor = isDark ? '#999' : '#666';

  return (
    <Animated.View
      style={[
        cardStyle,
        {
          opacity: animValue,
          transform: [
            {
              translateY: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.eventAccent} />
      <View style={styles.eventContent}>
        <Text style={summaryStyle}>{item.summary}</Text>
        {item.description ? (
          <Text style={descriptionStyle}>{item.description}</Text>
        ) : null}
        <View style={timeContainerStyle}>
          <MaterialIcons name="schedule" size={16} color={iconColor} style={styles.timeIcon} />
          <Text style={timeTextStyle}>
            {new Date(item.start).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Rome',
            })}{' '}
            -{' '}
            {new Date(item.end).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Rome',
            })}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
});

export default function App() {
  const [section, setSection] = useState('');
  const [professor, setProfessor] = useState('');
  const [savedSections, setSavedSections] = useState<string[]>([]);
  const [savedProfessors, setSavedProfessors] = useState<string[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow'>('today');
  const [viewMode, setViewMode] = useState<'section' | 'professor' | 'all'>('section');
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'info' } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const notificationAnim = useRef(new Animated.Value(0)).current;

  const showNotification = (message: string, type: 'error' | 'info' = 'error') => {
    setNotification({ message, type });
    
    Animated.sequence([
      Animated.timing(notificationAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(notificationAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setNotification(null));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    saveSettings();
  }, [isDark, savedSections, savedProfessors]);

  const loadSettings = async () => {
    try {
      const darkMode = await AsyncStorage.getItem('darkMode');
      const sections = await AsyncStorage.getItem('savedSections');
      const professors = await AsyncStorage.getItem('savedProfessors');
      
      if (darkMode !== null) {
        setIsDark(JSON.parse(darkMode));
      }
      
      if (sections !== null) {
        setSavedSections(JSON.parse(sections));
      }

      if (professors !== null) {
        setSavedProfessors(JSON.parse(professors));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem('darkMode', JSON.stringify(isDark));
      await AsyncStorage.setItem('savedSections', JSON.stringify(savedSections));
      await AsyncStorage.setItem('savedProfessors', JSON.stringify(savedProfessors));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const fetchEvents = React.useCallback(async (isRefresh = false, targetSection?: string, targetProfessor?: string, targetDate?: 'today' | 'tomorrow') => {
    Keyboard.dismiss();
    
    const sectionToFetch = (targetSection || section).toUpperCase();
    const professorToFetch = (targetProfessor || professor).toUpperCase();
    const dateToFetch = targetDate || dateFilter;

    if (viewMode === 'section' && !sectionToFetch.trim()) {
      showNotification('Inserisci una classe', 'info');
      return;
    }

    if (viewMode === 'professor' && !professorToFetch.trim()) {
      showNotification('Inserisci un professore', 'info');
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const today = new Date();
      const targetDateObj = dateToFetch === 'tomorrow' 
        ? new Date(today.getTime() + 24 * 60 * 60 * 1000)
        : today;
      const dateStr = targetDateObj.toISOString().split('T')[0];

      const params: any = { date: dateStr };
      
      if (viewMode === 'section') {
        params.section = sectionToFetch;
      }

      const res = await axios.get(`${BACKEND_URL}/events`, {
        params,
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
        },
      });

      // Filter events to only show the requested day
      let filteredEvents = res.data.filter((event: Event) => {
        const eventDate = new Date(event.start).toISOString().split('T')[0];
        return eventDate === dateStr;
      });

      // Apply mode-specific filters
      if (viewMode === 'section') {
        filteredEvents = filterEventsByClass(filteredEvents, sectionToFetch);
      } else if (viewMode === 'professor') {
        filteredEvents = filterEventsByProfessor(filteredEvents, professorToFetch);
      }

      // Sort events by start time
      filteredEvents.sort((a: Event, b: Event) => new Date(a.start).getTime() - new Date(b.start).getTime());

      setEvents(filteredEvents);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (err: any) {
      console.error('Fetch error:', err);
      
      let errorMessage = 'Impossibile caricare le variazioni.';
      
      if (err.code === 'ECONNABORTED') {
        errorMessage = 'Richiesta scaduta. Controlla la connessione e riprova.';
      } else if (err.response) {
        if (err.response.status === 503) {
          errorMessage = 'Server in caricamento. Riprova tra 30 secondi.';
        } else if (err.response.status >= 500) {
          errorMessage = 'Errore del server. Riprova più tardi.';
        } else if (err.response.status === 404) {
          errorMessage = 'Nessuna variazione trovata.';
        }
      } else if (err.request) {
        errorMessage = 'Nessuna connessione al server. Controlla la tua connessione internet.';
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [section, professor, dateFilter, viewMode, fadeAnim, slideAnim]);

  const onRefresh = () => {
    fetchEvents(true);
  };

  const addSection = () => {
    const trimmedSection = section.trim().toUpperCase();
    if (trimmedSection && !savedSections.includes(trimmedSection)) {
      setSavedSections([...savedSections, trimmedSection]);
    }
  };

  const removeSection = (sectionToRemove: string) => {
    setSavedSections(savedSections.filter(s => s !== sectionToRemove));
  };

  const addProfessor = () => {
    const trimmedProfessor = professor.trim().toUpperCase();
    if (trimmedProfessor && !savedProfessors.includes(trimmedProfessor)) {
      setSavedProfessors([...savedProfessors, trimmedProfessor]);
    }
  };

  const removeProfessor = (professorToRemove: string) => {
    setSavedProfessors(savedProfessors.filter(p => p !== professorToRemove));
  };

  const handleQuickSectionSelect = (sec: string) => {
    Keyboard.dismiss();
    setSection(sec);
    setViewMode('section');
    setTimeout(() => fetchEvents(false, sec, undefined, dateFilter), 50);
  };

  const handleQuickProfessorSelect = (prof: string) => {
    Keyboard.dismiss();
    setProfessor(prof);
    setViewMode('professor');
    setTimeout(() => fetchEvents(false, undefined, prof, dateFilter), 50);
  };

  useEffect(() => {
    if (viewMode === 'all') {
      fetchEvents();
    } else if (viewMode === 'section') {
      if (!section.trim()) {
        setEvents([]);
        fadeAnim.setValue(0);
        slideAnim.setValue(50);
      } else {
        fetchEvents();
      }
    } else if (viewMode === 'professor') {
      if (!professor.trim()) {
        setEvents([]);
        fadeAnim.setValue(0);
        slideAnim.setValue(50);
      } else {
        fetchEvents();
      }
    }
  }, [dateFilter, viewMode]);

  const containerStyle = isDark ? styles.containerDark : styles.container;
  const headerStyle = isDark ? styles.headerDark : styles.header;
  const titleStyle = isDark ? styles.titleDark : styles.title;
  const subtitleStyle = isDark ? styles.subtitleDark : styles.subtitle;
  const searchContainerStyle = isDark ? styles.searchContainerDark : styles.searchContainer;
  const inputStyle = isDark ? styles.inputDark : styles.input;
  const emptyTitleStyle = isDark ? styles.emptyTitleDark : styles.emptyTitle;
  const emptyTextStyle = isDark ? styles.emptyTextDark : styles.emptyText;
  const modalStyle = isDark ? styles.modalContentDark : styles.modalContent;

  const getSubtitle = React.useMemo(() => {
    const dateText = dateFilter === 'today' ? 'Today' : 'Tomorrow';
    let modeText = '';
    if (viewMode === 'all') {
      modeText = 'All Sections';
    } else if (viewMode === 'section') {
      modeText = section || 'Select Section';
    } else {
      modeText = professor || 'Select Professor';
    }
    return `${dateText} - ${modeText}`;
  }, [dateFilter, viewMode, section, professor]);

  return (
    <SafeAreaView style={containerStyle} edges={['top', 'left', 'right']}>
      <StatusBar 
        barStyle={isDark ? "light-content" : "dark-content"} 
        backgroundColor={isDark ? '#1a1a1a' : '#fff'} 
      />

      <View style={headerStyle}>
        <View style={styles.headerTop}>
          <View>
            <Text style={titleStyle}>Variazioni</Text>
            <Text style={subtitleStyle}>{getSubtitle}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowSettings(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="settings" size={28} color={isDark ? '#fff' : '#1a1a1a'} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.viewModeContainer, isDark && styles.viewModeContainerDark]}>
        <TouchableOpacity
          style={[
            styles.viewModeButton,
            viewMode === 'section' && styles.viewModeButtonActive,
            isDark && styles.viewModeButtonDark,
          ]}
          onPress={() => setViewMode('section')}
        >
          <MaterialIcons 
            name="class" 
            size={18} 
            color={viewMode === 'section' ? '#6366f1' : (isDark ? '#999' : '#666')} 
          />
          <Text style={[
            styles.viewModeText,
            viewMode === 'section' && styles.viewModeTextActive,
            isDark && styles.viewModeTextDark,
          ]}>
            Classe
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewModeButton,
            viewMode === 'professor' && styles.viewModeButtonActive,
            isDark && styles.viewModeButtonDark,
          ]}
          onPress={() => setViewMode('professor')}
        >
          <MaterialIcons 
            name="person" 
            size={18} 
            color={viewMode === 'professor' ? '#6366f1' : (isDark ? '#999' : '#666')} 
          />
          <Text style={[
            styles.viewModeText,
            viewMode === 'professor' && styles.viewModeTextActive,
            isDark && styles.viewModeTextDark,
          ]}>
            Prof.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewModeButton,
            viewMode === 'all' && styles.viewModeButtonActive,
            isDark && styles.viewModeButtonDark,
          ]}
          onPress={() => setViewMode('all')}
        >
          <MaterialIcons 
            name="view-list" 
            size={18} 
            color={viewMode === 'all' ? '#6366f1' : (isDark ? '#999' : '#666')} 
          />
          <Text style={[
            styles.viewModeText,
            viewMode === 'all' && styles.viewModeTextActive,
            isDark && styles.viewModeTextDark,
          ]}>
            Tutti
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'section' && (
        <View style={searchContainerStyle}>
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Classe</Text>
            <TextInput
              style={inputStyle}
              value={section}
              onChangeText={setSection}
              placeholder="es. 5AIIN, 3B..."
              placeholderTextColor={isDark ? '#666' : '#999'}
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity
            style={styles.fetchButton}
            onPress={() => fetchEvents()}
            activeOpacity={0.8}
          >
            <MaterialIcons name="search" size={20} color="#fff" style={styles.searchIcon} />
            <Text style={styles.fetchButtonText}>Cerca</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === 'professor' && (
        <View style={searchContainerStyle}>
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Prof.</Text>
            <TextInput
              style={inputStyle}
              value={professor}
              onChangeText={setProfessor}
              placeholder="es. ROSSI"
              placeholderTextColor={isDark ? '#666' : '#999'}
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity
            style={styles.fetchButton}
            onPress={() => fetchEvents()}
            activeOpacity={0.8}
          >
            <MaterialIcons name="search" size={20} color="#fff" style={styles.searchIcon} />
            <Text style={styles.fetchButtonText}>Cerca</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === 'section' && savedSections.length > 0 && (
        <View style={isDark ? styles.quickSelectWrapperDark : styles.quickSelectWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickSelectContent}
          >
            {savedSections.map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[
                  styles.quickButton,
                  section === sec && styles.quickButtonActive,
                  isDark && section !== sec && styles.quickButtonDark,
                ]}
                onPress={() => handleQuickSectionSelect(sec)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.quickButtonText,
                  section === sec && styles.quickButtonTextActive,
                  isDark && section !== sec && styles.quickButtonTextDark,
                ]}>
                  {sec}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {viewMode === 'professor' && savedProfessors.length > 0 && (
        <View style={isDark ? styles.quickSelectWrapperDark : styles.quickSelectWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickSelectContent}
          >
            {savedProfessors.map((prof) => (
              <TouchableOpacity
                key={prof}
                style={[
                  styles.quickButton,
                  professor === prof && styles.quickButtonActive,
                  isDark && professor !== prof && styles.quickButtonDark,
                ]}
                onPress={() => handleQuickProfessorSelect(prof)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.quickButtonText,
                  professor === prof && styles.quickButtonTextActive,
                  isDark && professor !== prof && styles.quickButtonTextDark,
                ]}>
                  {prof}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.dateFilterContainer, isDark && styles.dateFilterContainerDark]}>
        <TouchableOpacity
          style={[
            styles.dateFilterButton,
            dateFilter === 'today' && styles.dateFilterButtonActive,
            isDark && styles.dateFilterButtonDark,
          ]}
          onPress={() => setDateFilter('today')}
        >
          <MaterialIcons 
            name="today" 
            size={18} 
            color={dateFilter === 'today' ? '#6366f1' : (isDark ? '#999' : '#666')} 
          />
          <Text style={[
            styles.dateFilterText,
            dateFilter === 'today' && styles.dateFilterTextActive,
            isDark && styles.dateFilterTextDark,
          ]}>
            Oggi
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.dateFilterButton,
            dateFilter === 'tomorrow' && styles.dateFilterButtonActive,
            isDark && styles.dateFilterButtonDark,
          ]}
          onPress={() => setDateFilter('tomorrow')}
        >
          <MaterialIcons 
            name="event" 
            size={18} 
            color={dateFilter === 'tomorrow' ? '#6366f1' : (isDark ? '#999' : '#666')} 
          />
          <Text style={[
            styles.dateFilterText,
            dateFilter === 'tomorrow' && styles.dateFilterTextActive,
            isDark && styles.dateFilterTextDark,
          ]}>
            Domani
          </Text>
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <View style={styles.loader}>
              <MaterialIcons name="hourglass-empty" size={48} color={isDark ? '#999' : '#666'} />
              <Text style={[styles.loaderText, isDark && styles.loaderTextDark]}>Loading...</Text>
            </View>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.centerContainer}>
            <MaterialIcons name="event-available" size={64} color={isDark ? '#666' : '#999'} />
            <Text style={emptyTitleStyle}>Tutto a posto!</Text>
            <Text style={emptyTextStyle}>
              Nessuna variazione trovata per {
                viewMode === 'all' ? 'oggi' : 
                viewMode === 'professor' ? (professor || 'il professore') :
                (section || 'la tua classe')
              }.
            </Text>
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item, index }) => (
              <EventCard item={item} index={index} isDark={isDark} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#6366f1"
                colors={['#6366f1']}
              />
            }
          />
        )}
      </Animated.View>

      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={modalStyle}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>Impostazioni</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <MaterialIcons name="close" size={28} color={isDark ? '#999' : '#666'} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollViewContent}>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <MaterialIcons name="dark-mode" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>Tema scuro</Text>
                    <Text style={[styles.settingSubtext, isDark && styles.settingSubtextDark]}>
                      Applica tema scuro
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={setIsDark}
                  trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                  thumbColor={isDark ? '#6366f1' : '#f3f4f6'}
                />
              </View>

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <View style={styles.sectionHeader}>
                <MaterialIcons name="bookmark" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                    Classi salvate
                  </Text>
                  <Text style={[styles.sectionSubtext, isDark && styles.sectionSubtextDark]}>
                    Accesso rapido alle tue classi preferite
                  </Text>
                </View>
              </View>

              {savedSections.map((sec) => (
                <View key={sec} style={[styles.savedSectionRow, isDark && styles.savedSectionRowDark]}>
                  <View style={styles.savedSectionLeft}>
                    <MaterialIcons name="class" size={20} color={isDark ? '#fff' : '#1a1a1a'} />
                    <Text style={[styles.savedSectionText, isDark && styles.savedSectionTextDark]}>
                      {sec}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeSection(sec)}>
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addSectionButton}
                onPress={addSection}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={20} color="#fff" style={styles.addIcon} />
                <Text style={styles.addSectionText}>Aggiungi classe corrente</Text>
              </TouchableOpacity>

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <View style={styles.sectionHeader}>
                <MaterialIcons name="person" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                    Prof. salvati
                  </Text>
                  <Text style={[styles.sectionSubtext, isDark && styles.sectionSubtextDark]}>
                    Accesso rapido per i prof.
                  </Text>
                </View>
              </View>

              {savedProfessors.map((prof) => (
                <View key={prof} style={[styles.savedSectionRow, isDark && styles.savedSectionRowDark]}>
                  <View style={styles.savedSectionLeft}>
                    <MaterialIcons name="person" size={20} color={isDark ? '#fff' : '#1a1a1a'} />
                    <Text style={[styles.savedSectionText, isDark && styles.savedSectionTextDark]}>
                      {prof}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeProfessor(prof)}>
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addSectionButton}
                onPress={addProfessor}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={20} color="#fff" style={styles.addIcon} />
                <Text style={styles.addSectionText}>Aggiungi prof. corrente</Text>
              </TouchableOpacity>

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <View style={styles.sectionHeader}>
                <MaterialIcons name="info" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                    About
                  </Text>
                </View>
              </View>
              <Text style={[styles.aboutText, isDark && styles.aboutTextDark]}>
                FermiToday
              </Text>
              <Text style={[styles.aboutSubtext, isDark && styles.aboutSubtextDark]}>
                Visualizza le variazioni dell'orario giornaliero della tua classe, dei tuoi professori, o quella dei tuoi amici.{"\n"}Basta inserire la classe o il nome del professore per vedere eventuali modifiche all'orario di oggi.{"\n"}NON UFFICIALE
              </Text>
              <Text style={[styles.aboutVersion, isDark && styles.aboutVersionDark]}>
                Version 0.5.0 
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {notification && (
        <Animated.View
          style={[
            styles.notification,
            notification.type === 'error' ? styles.notificationError : styles.notificationInfo,
            {
              opacity: notificationAnim,
              transform: [{
                translateY: notificationAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-100, 0],
                }),
              }],
            },
          ]}
        >
          <MaterialIcons 
            name={notification.type === 'error' ? 'error-outline' : 'info-outline'} 
            size={24} 
            color="#fff" 
          />
          <Text style={styles.notificationText}>{notification.message}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  containerDark: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  headerDark: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#1a1a1a',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  settingsButton: {
    padding: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  titleDark: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
  },
  subtitleDark: {
    fontSize: 16,
    color: '#999',
    marginTop: 4,
    fontWeight: '500',
  },
  viewModeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  viewModeContainerDark: {
    backgroundColor: '#1a1a1a',
    borderBottomColor: '#2a2a2a',
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f7',
    gap: 8,
  },
  viewModeButtonDark: {
    backgroundColor: '#2a2a2a',
  },
  viewModeButtonActive: {
    backgroundColor: '#e0e7ff',
  },
  viewModeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  viewModeTextDark: {
    color: '#999',
  },
  viewModeTextActive: {
    color: '#6366f1',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#fff',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchContainerDark: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  inputWrapper: {
    flex: 1,
    marginRight: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputLabelDark: {
    color: '#999',
  },
  input: {
    backgroundColor: '#f5f5f7',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  inputDark: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  fetchButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchIcon: {
    marginRight: 4,
  },
  fetchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  quickSelectWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  quickSelectWrapperDark: {
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  quickSelectContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  quickButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f7',
    marginRight: 8,
  },
  quickButtonDark: {
    backgroundColor: '#3a3a3a',
  },
  quickButtonActive: {
    backgroundColor: '#6366f1',
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  quickButtonTextDark: {
    color: '#e0e0e0',
  },
  quickButtonTextActive: {
    color: '#fff',
  },
  dateFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dateFilterContainerDark: {
    backgroundColor: '#1a1a1a',
    borderBottomColor: '#2a2a2a',
  },
  dateFilterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f7',
    gap: 8,
  },
  dateFilterButtonDark: {
    backgroundColor: '#2a2a2a',
  },
  dateFilterButtonActive: {
    backgroundColor: '#e0e7ff',
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  dateFilterTextDark: {
    color: '#999',
  },
  dateFilterTextActive: {
    color: '#6366f1',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 32,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    flexDirection: 'row',
  },
  eventCardDark: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 3,
    flexDirection: 'row',
  },
  eventAccent: {
    width: 5,
    backgroundColor: '#6366f1',
  },
  eventContent: {
    flex: 1,
    padding: 18,
  },
  summary: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  summaryDark: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  descriptionDark: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
    marginBottom: 12,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  timeContainerDark: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  timeIcon: {
    marginRight: 6,
  },
  timeText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  timeTextDark: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loader: {
    padding: 24,
    alignItems: 'center',
  },
  loaderText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    marginTop: 12,
  },
  loaderTextDark: {
    color: '#999',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    marginTop: 16,
  },
  emptyTitleDark: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyTextDark: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 0,
    maxHeight: '90%',
    minHeight: '90%',
  },
  modalContentDark: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 0,
    maxHeight: '90%',
    minHeight: '90%',
  },
  scrollViewContent: {
    paddingBottom: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalTitleDark: {
    color: '#ffffff',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  settingLabelDark: {
    color: '#ffffff',
  },
  settingSubtext: {
    fontSize: 13,
    color: '#666',
  },
  settingSubtextDark: {
    color: '#999',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
  },
  separatorDark: {
    backgroundColor: '#2a2a2a',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  sectionTitleDark: {
    color: '#ffffff',
  },
  sectionSubtext: {
    fontSize: 13,
    color: '#666',
  },
  sectionSubtextDark: {
    color: '#999',
  },
  savedSectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f7',
    borderRadius: 12,
    marginBottom: 8,
    marginTop: 12,
  },
  savedSectionRowDark: {
    backgroundColor: '#2a2a2a',
  },
  savedSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedSectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  savedSectionTextDark: {
    color: '#ffffff',
  },
  addSectionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  addIcon: {
    marginRight: 4,
  },
  addSectionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  aboutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  aboutTextDark: {
    color: '#ffffff',
  },
  aboutSubtext: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  aboutSubtextDark: {
    color: '#999',
  },
  aboutVersion: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  aboutVersionDark: {
    color: '#666',
  },
  notification: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    gap: 12,
    zIndex: 9999,
  },
  notificationError: {
    backgroundColor: '#ef4444',
  },
  notificationInfo: {
    backgroundColor: '#6366f1',
  },
  notificationText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});