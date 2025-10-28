import React, { useState, useEffect, useRef } from "react";
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
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import axios from "axios";

const BACKEND_URL = "https://purring-celesta-fermitoday-f00679ea.koyeb.app";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Event = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  isAllDay?: boolean;
};

const extractClassFromSummary = (summary: string): string | null => {
  const classMatch = summary.match(/CLASSE\s+([A-Z0-9]+)\s/);
  return classMatch ? classMatch[1] : null;
};

const extractProfessorFromSummary = (summary: string): string[] => {
  const professors: string[] = [];
  const pluralMatch = summary.match(/PROFF?\.(?:ssa)?\s*([A-Z][A-Z\s,.']+?)(?=\s*CLASSE|\s*AULA|\s*ASSENTE|\s*$)/i);
  if (pluralMatch) {
    const names = pluralMatch[1].split(',');
    for (const name of names) {
      const trimmedName = name.trim().replace(/['"]+$/, '').trim().replace(/\s+/g, " ");
      if (trimmedName.length > 0 && trimmedName.length < 50) {
        professors.push(trimmedName);
      }
    }
    if (professors.length > 0) return professors;
  }
  const profMatches = [...summary.matchAll(/PROF\.?(?:ssa)?\.?\s*([A-Z][A-Z\s]+?)(?=\s*[,\(\)]|\s+ASSENTE|\s+CLASSE|\s*$)/gi)];
  for (const match of profMatches) {
    if (match[1]) {
      const profName = match[1].trim().replace(/\s+/g, " ");
      if (profName.length > 0) professors.push(profName);
    }
  }
  return professors;
};

const filterEventsByClass = (events: Event[], classCode: string): Event[] => {
  const upperClassCode = classCode.toUpperCase().trim();
  return events.filter((event) => {
    const extractedClass = extractClassFromSummary(event.summary);
    return extractedClass === upperClassCode;
  });
};

const filterEventsByProfessor = (events: Event[], professorName: string): Event[] => {
  const upperProfName = professorName.toUpperCase().trim();
  return events.filter((event) => {
    const extractedProfs = extractProfessorFromSummary(event.summary);
    if (extractedProfs.length > 0) {
      const found = extractedProfs.some((prof) => prof.toUpperCase() === upperProfName);
      if (found) return true;
    }
    const descriptionUpper = event.description ? event.description.toUpperCase() : "";
    if (descriptionUpper.includes(`PROF`) && descriptionUpper.includes(upperProfName)) {
      return true;
    }
    return false;
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

  const isAllDayEvent = item.isAllDay || (typeof item.start === "string" && item.start.length === 10 && item.start.includes("-"));
  const formatTime = () => {
    if (isAllDayEvent) return "Tutto il giorno";
    try {
      const startTime = new Date(item.start).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
      const endTime = new Date(item.end).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
      return `${startTime} - ${endTime}`;
    } catch (error) {
      return "Orario non disponibile";
    }
  };

  return (
    <Animated.View style={[isDark ? styles.eventCardDark : styles.eventCard, { opacity: animValue, transform: [{ translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      <View style={styles.eventAccent} />
      <View style={styles.eventContent}>
        <Text style={isDark ? styles.summaryDark : styles.summary}>{item.summary}</Text>
        {item.description ? <Text style={isDark ? styles.descriptionDark : styles.description}>{item.description}</Text> : null}
        <View style={isDark ? styles.timeContainerDark : styles.timeContainer}>
          <MaterialIcons name={isAllDayEvent ? "event" : "schedule"} size={16} color={isDark ? "#999" : "#666"} style={styles.timeIcon} />
          <Text style={isDark ? styles.timeTextDark : styles.timeText}>{formatTime()}</Text>
        </View>
      </View>
    </Animated.View>
  );
});

export default function App() {
  const [section, setSection] = useState("");
  const [professor, setProfessor] = useState("");
  const [savedSections, setSavedSections] = useState<string[]>([]);
  const [savedProfessors, setSavedProfessors] = useState<string[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dateFilter, setDateFilter] = useState<"today" | "tomorrow">("today");
  const [viewMode, setViewMode] = useState<"section" | "professor" | "all">("section");
  const [notification, setNotification] = useState<{ message: string; type: "error" | "info" } | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationSection, setNotificationSection] = useState('');
  const [notificationProfessor, setNotificationProfessor] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState('06:00');
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const notificationAnim = useRef(new Animated.Value(0)).current;
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  const showNotification = (message: string, type: "error" | "info" = "error") => {
    setNotification({ message, type });
    Animated.sequence([
      Animated.timing(notificationAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(notificationAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setNotification(null));
  };

  async function registerForPushNotificationsAsync() {
  let token;
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fermitoday_updates', {
      name: 'FermiToday Updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
    });
  }
  
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert(
        'Notifiche disabilitate', 
        'Per ricevere le notifiche sulle variazioni, attiva le notifiche nelle impostazioni.'
      );
      return null;
    }
    
    try {
      token = (await Notifications.getExpoPushTokenAsync({ 
        projectId: '80ad0eb0-cd57-4b36-bebd-10bb86061534' 
      })).data;
      console.log('✅ Push token obtained:', token.substring(0, 30) + '...');
    } catch (error: any) {
      console.error('❌ Failed to get push token:', error.message);
      Alert.alert('Errore', 'Impossibile ottenere il token delle notifiche: ' + error.message);
      return null;
    }
  } else {
    Alert.alert('Errore', 'Le notifiche funzionano solo su dispositivi fisici.');
    return null;
  }
  
  return token;
}

  async function registerTokenWithBackend(token: string) {
    try {
      const payload = {
        token: token,
        section: notificationSection.trim() || null,
        professor: notificationProfessor.trim() || null,
        digestEnabled: digestEnabled,
        digestTime: digestTime,
        realtimeEnabled: realtimeEnabled
      };
      
      console.log('📤 Registering token:', {
        tokenPreview: token.substring(0, 30) + '...',
        section: payload.section,
        professor: payload.professor
      });
      
      const response = await axios.post(`${BACKEND_URL}/register-token`, payload, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('✅ Backend response:', response.data);
      return true;
    } catch (error: any) {
      console.error('❌ Registration failed:', error.response?.data || error.message);
      return false;
    }
  }

  async function unregisterTokenFromBackend(token: string) {
    try {
      await axios.post(`${BACKEND_URL}/unregister-token`, { token });
      console.log('✅ Token unregistered from backend');
    } catch (error) {
      console.error('❌ Failed to unregister token:', error);
    }
  }

  async function updatePreferencesOnBackend() {
    if (!expoPushToken) return;
    try {
      await axios.post(`${BACKEND_URL}/update-preferences`, { token: expoPushToken, section: notificationSection || null, professor: notificationProfessor || null, digestEnabled, digestTime, realtimeEnabled });
      console.log('✅ Preferences updated on backend');
    } catch (error) {
      console.error('❌ Failed to update preferences:', error);
    }
  }

  const handleNotificationReceived = (notification: Notifications.Notification) => {
    console.log('📩 Notification received:', notification);
  };

  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    console.log('👆 Notification tapped:', data);
    if (data.type === 'digest' || data.type === 'realtime') {
      if (data.section) {
        setSection(data.section as string);
        setViewMode('section');
        setDateFilter('today');
        setTimeout(() => fetchEvents(false, data.section as string, undefined, 'today'), 100);
      } else if (data.professor) {
        setProfessor(data.professor as string);
        setViewMode('professor');
        setDateFilter('today');
        setTimeout(() => fetchEvents(false, undefined, data.professor as string, 'today'), 100);
      }
    }
  };

  useEffect(() => {
    loadSettings();
    notificationListener.current = Notifications.addNotificationReceivedListener(handleNotificationReceived);
    responseListener.current = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  useEffect(() => { saveSettings(); }, [isDark, savedSections, savedProfessors, notificationsEnabled, notificationSection, notificationProfessor, digestEnabled, digestTime, realtimeEnabled]);
  useEffect(() => { if (notificationsEnabled && expoPushToken) updatePreferencesOnBackend(); }, [notificationSection, notificationProfessor, digestEnabled, digestTime, realtimeEnabled]);

  const loadSettings = async () => {
    try {
      const darkMode = await AsyncStorage.getItem("darkMode");
      const sections = await AsyncStorage.getItem("savedSections");
      const professors = await AsyncStorage.getItem("savedProfessors");
      const notifEnabled = await AsyncStorage.getItem('notificationsEnabled');
      const notifSection = await AsyncStorage.getItem('notificationSection');
      const notifProfessor = await AsyncStorage.getItem('notificationProfessor');
      const digest = await AsyncStorage.getItem('digestEnabled');
      const digestT = await AsyncStorage.getItem('digestTime');
      const realtime = await AsyncStorage.getItem('realtimeEnabled');
      const pushToken = await AsyncStorage.getItem('expoPushToken');
      if (darkMode !== null) setIsDark(JSON.parse(darkMode));
      if (sections !== null) setSavedSections(JSON.parse(sections));
      if (professors !== null) setSavedProfessors(JSON.parse(professors));
      if (notifEnabled !== null) setNotificationsEnabled(JSON.parse(notifEnabled));
      if (notifSection !== null) setNotificationSection(notifSection);
      if (notifProfessor !== null) setNotificationProfessor(notifProfessor);
      if (digest !== null) setDigestEnabled(JSON.parse(digest));
      if (digestT !== null) setDigestTime(digestT);
      if (realtime !== null) setRealtimeEnabled(JSON.parse(realtime));
      if (pushToken !== null) setExpoPushToken(pushToken);
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem("darkMode", JSON.stringify(isDark));
      await AsyncStorage.setItem("savedSections", JSON.stringify(savedSections));
      await AsyncStorage.setItem("savedProfessors", JSON.stringify(savedProfessors));
      await AsyncStorage.setItem('notificationsEnabled', JSON.stringify(notificationsEnabled));
      await AsyncStorage.setItem('notificationSection', notificationSection);
      await AsyncStorage.setItem('notificationProfessor', notificationProfessor);
      await AsyncStorage.setItem('digestEnabled', JSON.stringify(digestEnabled));
      await AsyncStorage.setItem('digestTime', digestTime);
      await AsyncStorage.setItem('realtimeEnabled', JSON.stringify(realtimeEnabled));
      if (expoPushToken) await AsyncStorage.setItem('expoPushToken', expoPushToken);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
  if (enabled) {
    try {
      // First, get the push token
      const token = await registerForPushNotificationsAsync();
      
      if (!token) {
        showNotification('Impossibile ottenere il token delle notifiche', 'error');
        return; // Don't enable notifications
      }

      console.log('✅ Got push token:', token.substring(0, 30) + '...');
      
      // Save token to state and AsyncStorage
      setExpoPushToken(token);
      await AsyncStorage.setItem('expoPushToken', token);

      // Prepare payload for backend
      const payload = {
        token: token,
        section: notificationSection.trim() || null,
        professor: notificationProfessor.trim() || null,
        digestEnabled: digestEnabled,
        digestTime: digestTime,
        realtimeEnabled: realtimeEnabled
      };
      
      console.log('📤 Registering with backend:', {
        tokenPreview: token.substring(0, 30) + '...',
        section: payload.section,
        professor: payload.professor,
        digestEnabled: payload.digestEnabled,
        realtimeEnabled: payload.realtimeEnabled
      });
      
      // Register with backend
      const response = await axios.post(
        `${BACKEND_URL}/register-token`, 
        payload,
        {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      console.log('✅ Backend registration successful:', response.data);
      
      // Only enable notifications after successful backend registration
      setNotificationsEnabled(true);
      showNotification('Notifiche attivate! Configura classe o professore.', 'info');
      
    } catch (error: any) {
      console.error('❌ Notification registration failed:', error.response?.data || error.message);
      
      // Clean up on failure
      setExpoPushToken('');
      setNotificationsEnabled(false);
      
      // Show specific error message
      let errorMessage = 'Errore nell\'attivazione delle notifiche';
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Timeout nella registrazione. Riprova.';
      } else if (error.response) {
        errorMessage = error.response.data?.error || 'Errore del server';
      } else if (error.request) {
        errorMessage = 'Nessuna connessione al server';
      }
      
      showNotification(errorMessage, 'error');
    }
  } else {
    // Disable notifications
    try {
      if (expoPushToken) {
        await unregisterTokenFromBackend(expoPushToken);
      }
      setNotificationsEnabled(false);
      setExpoPushToken('');
      await AsyncStorage.removeItem('expoPushToken');
      showNotification('Notifiche disattivate', 'info');
    } catch (error) {
      console.error('❌ Error disabling notifications:', error);
      showNotification('Errore nella disattivazione', 'error');
    }
  }
};

  const fetchEvents = React.useCallback(async (isRefresh = false, targetSection?: string, targetProfessor?: string, targetDate?: "today" | "tomorrow") => {
    Keyboard.dismiss();
    const sectionToFetch = (targetSection || section).toUpperCase();
    const professorToFetch = (targetProfessor || professor).toUpperCase();
    const dateToFetch = targetDate || dateFilter;
    if (viewMode === "section" && !sectionToFetch.trim()) { showNotification("Inserisci una classe", "info"); return; }
    if (viewMode === "professor" && !professorToFetch.trim()) { showNotification("Inserisci un professore", "info"); return; }
    if (isRefresh) { setRefreshing(true); } else { setLoading(true); }
    try {
      const today = new Date();
      const targetDateObj = dateToFetch === "tomorrow" ? new Date(today.getTime() + 24 * 60 * 60 * 1000) : today;
      const dateStr = targetDateObj.toISOString().split("T")[0];
      const params: any = { date: dateStr };
      if (viewMode === "section") params.section = sectionToFetch;
      const res = await axios.get(`${BACKEND_URL}/events`, { params, timeout: 30000, headers: { Accept: "application/json" } });
      let filteredEvents = res.data.filter((event: Event) => {
        let eventDate;
        if (event.isAllDay) { eventDate = event.start; }
        else if (typeof event.start === "string" && event.start.length === 10) { eventDate = event.start; }
        else if (typeof event.start === "string") { eventDate = event.start.split("T")[0]; }
        else { eventDate = new Date(event.start).toISOString().split("T")[0]; }
        return eventDate === dateStr;
      });
      if (viewMode === "section") { filteredEvents = filterEventsByClass(filteredEvents, sectionToFetch); }
      else if (viewMode === "professor") { filteredEvents = filterEventsByProfessor(filteredEvents, professorToFetch); }
      filteredEvents.sort((a: Event, b: Event) => {
        const aTime = typeof a.start === "string" && a.start.length === 10 ? 0 : new Date(a.start).getTime();
        const bTime = typeof b.start === "string" && b.start.length === 10 ? 0 : new Date(b.start).getTime();
        return aTime - bTime;
      });
      setEvents(filteredEvents);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]).start();
    } catch (err: any) {
      console.error("Fetch error:", err);
      let errorMessage = "Impossibile caricare le variazioni.";
      if (err.code === "ECONNABORTED") { errorMessage = "Richiesta scaduta. Controlla la connessione e riprova."; }
      else if (err.response) {
        if (err.response.status === 503) { errorMessage = "Server in caricamento. Riprova tra 30 secondi."; }
        else if (err.response.status >= 500) { errorMessage = "Errore del server. Riprova più tardi."; }
        else if (err.response.status === 404) { errorMessage = "Nessuna variazione trovata."; }
      } else if (err.request) { errorMessage = "Nessuna connessione al server. Controlla la tua connessione internet."; }
      showNotification(errorMessage, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [section, professor, dateFilter, viewMode, fadeAnim, slideAnim]);

  const onRefresh = () => { fetchEvents(true); };
  const addSection = () => {
    const trimmedSection = section.trim().toUpperCase();
    if (trimmedSection && !savedSections.includes(trimmedSection)) setSavedSections([...savedSections, trimmedSection]);
  };
  const removeSection = (sectionToRemove: string) => { setSavedSections(savedSections.filter((s) => s !== sectionToRemove)); };
  const addProfessor = () => {
    const trimmedProfessor = professor.trim().toUpperCase();
    if (trimmedProfessor && !savedProfessors.includes(trimmedProfessor)) setSavedProfessors([...savedProfessors, trimmedProfessor]);
  };
  const removeProfessor = (professorToRemove: string) => { setSavedProfessors(savedProfessors.filter((p) => p !== professorToRemove)); };
  const handleQuickSectionSelect = (sec: string) => {
    Keyboard.dismiss();
    setSection(sec);
    setViewMode("section");
    setTimeout(() => fetchEvents(false, sec, undefined, dateFilter), 50);
  };
  const handleQuickProfessorSelect = (prof: string) => {
    Keyboard.dismiss();
    setProfessor(prof);
    setViewMode("professor");
    setTimeout(() => fetchEvents(false, undefined, prof, dateFilter), 50);
  };

  useEffect(() => {
    if (viewMode === "all") { fetchEvents(); }
    else if (viewMode === "section") {
      if (!section.trim()) { setEvents([]); fadeAnim.setValue(0); slideAnim.setValue(50); }
      else { fetchEvents(); }
    } else if (viewMode === "professor") {
      if (!professor.trim()) { setEvents([]); fadeAnim.setValue(0); slideAnim.setValue(50); }
      else { fetchEvents(); }
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
    const dateText = dateFilter === "today" ? "Today" : "Tomorrow";
    let modeText = "";
    if (viewMode === "all") { modeText = "All Sections"; }
    else if (viewMode === "section") { modeText = section || "Select Section"; }
    else { modeText = professor || "Select Professor"; }
    return `${dateText} - ${modeText}`;
  }, [dateFilter, viewMode, section, professor]);

  return (
    <SafeAreaView style={containerStyle} edges={["top", "left", "right"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#1a1a1a" : "#fff"} />
      <View style={headerStyle}>
        <View style={styles.headerTop}>
          <View>
            <Text style={titleStyle}>Variazioni</Text>
            <Text style={subtitleStyle}>{getSubtitle}</Text>
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)} activeOpacity={0.7}>
            <MaterialIcons name="settings" size={28} color={isDark ? "#fff" : "#1a1a1a"} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.viewModeContainer, isDark && styles.viewModeContainerDark]}>
        {["section", "professor", "all"].map((mode) => (
          <TouchableOpacity key={mode} style={[styles.viewModeButton, viewMode === mode && styles.viewModeButtonActive, isDark && styles.viewModeButtonDark]} onPress={() => setViewMode(mode as any)}>
            <MaterialIcons name={mode === "section" ? "class" : mode === "professor" ? "person" : "view-list"} size={18} color={viewMode === mode ? "#6366f1" : isDark ? "#999" : "#666"} />
            <Text style={[styles.viewModeText, viewMode === mode && styles.viewModeTextActive, isDark && styles.viewModeTextDark]}>
              {mode === "section" ? "Classe" : mode === "professor" ? "Prof." : "Tutti"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === "section" && (
        <View style={searchContainerStyle}>
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Classe</Text>
            <TextInput style={inputStyle} value={section} onChangeText={setSection} placeholder="es. 5AIIN, 3B..." placeholderTextColor={isDark ? "#666" : "#999"} autoCorrect={false} />
          </View>
          <TouchableOpacity style={styles.fetchButton} onPress={() => fetchEvents()} activeOpacity={0.8}>
            <MaterialIcons name="search" size={20} color="#fff" style={styles.searchIcon} />
            <Text style={styles.fetchButtonText}>Cerca</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === "professor" && (
        <View style={searchContainerStyle}>
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Prof.</Text>
            <TextInput style={inputStyle} value={professor} onChangeText={setProfessor} placeholder="es. ROSSI" placeholderTextColor={isDark ? "#666" : "#999"} autoCorrect={false} />
          </View>
          <TouchableOpacity style={styles.fetchButton} onPress={() => fetchEvents()} activeOpacity={0.8}>
            <MaterialIcons name="search" size={20} color="#fff" style={styles.searchIcon} />
            <Text style={styles.fetchButtonText}>Cerca</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === "section" && savedSections.length > 0 && (
        <View style={isDark ? styles.quickSelectWrapperDark : styles.quickSelectWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickSelectContent}>
            {savedSections.map((sec) => (
              <TouchableOpacity key={sec} style={[styles.quickButton, section === sec && styles.quickButtonActive, isDark && section !== sec && styles.quickButtonDark]} onPress={() => handleQuickSectionSelect(sec)} activeOpacity={0.7}>
                <Text style={[styles.quickButtonText, section === sec && styles.quickButtonTextActive, isDark && section !== sec && styles.quickButtonTextDark]}>{sec}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {viewMode === "professor" && savedProfessors.length > 0 && (
        <View style={isDark ? styles.quickSelectWrapperDark : styles.quickSelectWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickSelectContent}>
            {savedProfessors.map((prof) => (
              <TouchableOpacity key={prof} style={[styles.quickButton, professor === prof && styles.quickButtonActive, isDark && professor !== prof && styles.quickButtonDark]} onPress={() => handleQuickProfessorSelect(prof)} activeOpacity={0.7}>
                <Text style={[styles.quickButtonText, professor === prof && styles.quickButtonTextActive, isDark && professor !== prof && styles.quickButtonTextDark]}>{prof}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.dateFilterContainer, isDark && styles.dateFilterContainerDark]}>
        {["today", "tomorrow"].map((filter) => (
          <TouchableOpacity key={filter} style={[styles.dateFilterButton, dateFilter === filter && styles.dateFilterButtonActive, isDark && styles.dateFilterButtonDark]} onPress={() => setDateFilter(filter as any)}>
            <MaterialIcons name={filter === "today" ? "today" : "event"} size={18} color={dateFilter === filter ? "#6366f1" : isDark ? "#999" : "#666"} />
            <Text style={[styles.dateFilterText, dateFilter === filter && styles.dateFilterTextActive, isDark && styles.dateFilterTextDark]}>
              {filter === "today" ? "Oggi" : "Domani"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {loading ? (
          <View style={styles.centerContainer}>
            <View style={styles.loader}>
              <MaterialIcons name="hourglass-empty" size={48} color={isDark ? "#999" : "#666"} />
              <Text style={[styles.loaderText, isDark && styles.loaderTextDark]}>Loading...</Text>
            </View>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.centerContainer}>
            <MaterialIcons name="event-available" size={64} color={isDark ? "#666" : "#999"} />
            <Text style={emptyTitleStyle}>Tutto a posto!</Text>
            <Text style={emptyTextStyle}>
              Nessuna variazione trovata per {viewMode === "all" ? "oggi" : viewMode === "professor" ? (professor || "il professore") : (section || "la tua classe")}.
            </Text>
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item, index }) => <EventCard item={item} index={index} isDark={isDark} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" colors={["#6366f1"]} />}
          />
        )}
      </Animated.View>

      <Modal visible={showSettings} animationType="slide" transparent={true} onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={modalStyle}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>Impostazioni</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <MaterialIcons name="close" size={28} color={isDark ? "#999" : "#666"} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollViewContent}>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <MaterialIcons name="dark-mode" size={24} color={isDark ? "#fff" : "#1a1a1a"} />
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>Tema scuro</Text>
                    <Text style={[styles.settingSubtext, isDark && styles.settingSubtextDark]}>Applica tema scuro</Text>
                  </View>
                </View>
                <Switch value={isDark} onValueChange={setIsDark} trackColor={{ false: "#d1d5db", true: "#818cf8" }} thumbColor={isDark ? "#6366f1" : "#f3f4f6"} />
              </View>

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <View style={styles.sectionHeader}>
                <MaterialIcons name="notifications" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Notifiche Push</Text>
                  <Text style={[styles.sectionSubtext, isDark && styles.sectionSubtextDark]}>Ricevi notifiche sulle variazioni</Text>
                </View>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <MaterialIcons name="notifications-active" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>Abilita notifiche</Text>
                    <Text style={[styles.settingSubtext, isDark && styles.settingSubtextDark]}>Ricevi notifiche su variazioni</Text>
                  </View>
                </View>
                <Switch value={notificationsEnabled} onValueChange={toggleNotifications} trackColor={{ false: '#d1d5db', true: '#818cf8' }} thumbColor={notificationsEnabled ? '#6366f1' : '#f3f4f6'} />
              </View>

              {notificationsEnabled && (
                <>
                  <View style={[styles.notificationInput, isDark && styles.notificationInputDark]}>
                    <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Classe per notifiche</Text>
                    <TextInput style={[inputStyle, { marginBottom: 0 }]} value={notificationSection} onChangeText={setNotificationSection} placeholder="es. 5AIIN" placeholderTextColor={isDark ? '#666' : '#999'} autoCorrect={false} />
                  </View>

                  <View style={[styles.notificationInput, isDark && styles.notificationInputDark]}>
                    <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Prof. per notifiche (opzionale)</Text>
                    <TextInput style={[inputStyle, { marginBottom: 0 }]} value={notificationProfessor} onChangeText={setNotificationProfessor} placeholder="es. ROSSI" placeholderTextColor={isDark ? '#666' : '#999'} autoCorrect={false} />
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingLeft}>
                      <MaterialIcons name="schedule" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                      <View style={styles.settingTextContainer}>
                        <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>Riepilogo giornaliero</Text>
                        <Text style={[styles.settingSubtext, isDark && styles.settingSubtextDark]}>Notifica con le variazioni del giorno</Text>
                      </View>
                    </View>
                    <Switch value={digestEnabled} onValueChange={setDigestEnabled} trackColor={{ false: '#d1d5db', true: '#818cf8' }} thumbColor={digestEnabled ? '#6366f1' : '#f3f4f6'} />
                  </View>

                  {digestEnabled && (
                    <View style={[styles.timePickerContainer, isDark && styles.timePickerContainerDark]}>
                      <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Orario riepilogo</Text>
                      <View style={styles.timeButtons}>
                        {['06:00', '07:00', '08:00'].map((time) => (
                          <TouchableOpacity key={time} style={[styles.timeButton, digestTime === time && styles.timeButtonActive, isDark && styles.timeButtonDark]} onPress={() => setDigestTime(time)}>
                            <Text style={[styles.timeButtonText, digestTime === time && styles.timeButtonTextActive, isDark && styles.timeButtonTextDark]}>{time}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={styles.settingRow}>
                    <View style={styles.settingLeft}>
                      <MaterialIcons name="bolt" size={24} color={isDark ? '#fff' : '#1a1a1a'} />
                      <View style={styles.settingTextContainer}>
                        <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>Notifiche in tempo reale</Text>
                        <Text style={[styles.settingSubtext, isDark && styles.settingSubtextDark]}>Notifica quando vengono aggiunte nuove variazioni</Text>
                      </View>
                    </View>
                    <Switch value={realtimeEnabled} onValueChange={setRealtimeEnabled} trackColor={{ false: '#d1d5db', true: '#818cf8' }} thumbColor={realtimeEnabled ? '#6366f1' : '#f3f4f6'} />
                  </View>

                  {(!notificationSection && !notificationProfessor) && (
                    <View style={[styles.warningBox, isDark && styles.warningBoxDark]}>
                      <MaterialIcons name="warning" size={20} color="#f59e0b" />
                      <Text style={[styles.warningText, isDark && styles.warningTextDark]}>Inserisci almeno una classe o un professore per ricevere notifiche</Text>
                    </View>
                  )}
                </>
              )}

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <View style={styles.sectionHeader}>
                <MaterialIcons name="bookmark" size={24} color={isDark ? "#fff" : "#1a1a1a"} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Classi salvate</Text>
                  <Text style={[styles.sectionSubtext, isDark && styles.sectionSubtextDark]}>Accesso rapido alle tue classi preferite</Text>
                </View>
              </View>

              {savedSections.map((sec) => (
                <View key={sec} style={[styles.savedSectionRow, isDark && styles.savedSectionRowDark]}>
                  <View style={styles.savedSectionLeft}>
                    <MaterialIcons name="class" size={20} color={isDark ? "#fff" : "#1a1a1a"} />
                    <Text style={[styles.savedSectionText, isDark && styles.savedSectionTextDark]}>{sec}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeSection(sec)}>
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addSectionButton} onPress={addSection} activeOpacity={0.8}>
                <MaterialIcons name="add" size={20} color="#fff" style={styles.addIcon} />
                <Text style={styles.addSectionText}>Aggiungi classe corrente</Text>
              </TouchableOpacity>

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <View style={styles.sectionHeader}>
                <MaterialIcons name="person" size={24} color={isDark ? "#fff" : "#1a1a1a"} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Prof. salvati</Text>
                  <Text style={[styles.sectionSubtext, isDark && styles.sectionSubtextDark]}>Accesso rapido per i prof.</Text>
                </View>
              </View>

              {savedProfessors.map((prof) => (
                <View key={prof} style={[styles.savedSectionRow, isDark && styles.savedSectionRowDark]}>
                  <View style={styles.savedSectionLeft}>
                    <MaterialIcons name="person" size={20} color={isDark ? "#fff" : "#1a1a1a"} />
                    <Text style={[styles.savedSectionText, isDark && styles.savedSectionTextDark]}>{prof}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeProfessor(prof)}>
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addSectionButton} onPress={addProfessor} activeOpacity={0.8}>
                <MaterialIcons name="add" size={20} color="#fff" style={styles.addIcon} />
                <Text style={styles.addSectionText}>Aggiungi prof. corrente</Text>
              </TouchableOpacity>

              <View style={[styles.separator, isDark && styles.separatorDark]} />

              <TouchableOpacity 
  style={styles.addSectionButton} 
  onPress={async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/health`);
      Alert.alert('Backend Status', JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      Alert.alert('Backend Error', error.message);
    }
  }}
>
  <Text style={styles.addSectionText}>Test Backend Connection</Text>
</TouchableOpacity>

              <View style={styles.sectionHeader}>
                <MaterialIcons name="info" size={24} color={isDark ? "#fff" : "#1a1a1a"} />
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>About</Text>
                </View>
              </View>
              <Text style={[styles.aboutText, isDark && styles.aboutTextDark]}>FermiToday</Text>
              <Text style={[styles.aboutSubtext, isDark && styles.aboutSubtextDark]}>
                Visualizza le variazioni dell'orario giornaliero della tua classe, dei tuoi professori, o quella dei tuoi amici.{"\n"}Basta inserire la classe o il nome del professore per vedere eventuali modifiche all'orario di oggi.{"\n"}NON UFFICIALE
              </Text>
              <Text style={[styles.aboutVersion, isDark && styles.aboutVersionDark]}>Version 0.7.5</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {notification && (
        <Animated.View style={[styles.notification, notification.type === "error" ? styles.notificationError : styles.notificationInfo, { opacity: notificationAnim, transform: [{ translateY: notificationAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 0] }) }] }]}>
          <MaterialIcons name={notification.type === "error" ? "error-outline" : "info-outline"} size={24} color="#fff" />
          <Text style={styles.notificationText}>{notification.message}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  containerDark: { flex: 1, backgroundColor: "#0f0f0f" },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, backgroundColor: "#fff" },
  headerDark: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, backgroundColor: "#1a1a1a" },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  settingsButton: { padding: 8 },
  title: { fontSize: 32, fontWeight: "800", color: "#1a1a1a", letterSpacing: -0.5 },
  titleDark: { fontSize: 32, fontWeight: "800", color: "#ffffff", letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: "#666", marginTop: 4, fontWeight: "500" },
  subtitleDark: { fontSize: 16, color: "#999", marginTop: 4, fontWeight: "500" },
  viewModeContainer: { flexDirection: "row", paddingHorizontal: 24, paddingVertical: 12, backgroundColor: "#fff", gap: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  viewModeContainerDark: { backgroundColor: "#1a1a1a", borderBottomColor: "#2a2a2a" },
  viewModeButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#f5f5f7", gap: 8 },
  viewModeButtonDark: { backgroundColor: "#2a2a2a" },
  viewModeButtonActive: { backgroundColor: "#e0e7ff" },
  viewModeText: { fontSize: 14, fontWeight: "600", color: "#666" },
  viewModeTextDark: { color: "#999" },
  viewModeTextActive: { color: "#6366f1" },
  searchContainer: { flexDirection: "row", paddingHorizontal: 24, paddingVertical: 20, backgroundColor: "#fff", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  searchContainerDark: { flexDirection: "row", paddingHorizontal: 24, paddingVertical: 20, backgroundColor: "#1a1a1a", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  inputWrapper: { flex: 1, marginRight: 12 },
  inputLabel: { fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  inputLabelDark: { color: "#999" },
  input: { backgroundColor: "#f5f5f7", borderRadius: 12, padding: 14, fontSize: 16, color: "#1a1a1a", fontWeight: "600" },
  inputDark: { backgroundColor: "#2a2a2a", borderRadius: 12, padding: 14, fontSize: 16, color: "#ffffff", fontWeight: "600" },
  fetchButton: { backgroundColor: "#6366f1", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, shadowColor: "#6366f1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, flexDirection: "row", alignItems: "center", gap: 8 },
  searchIcon: { marginRight: 4 },
  fetchButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  quickSelectWrapper: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  quickSelectWrapperDark: { backgroundColor: "#1a1a1a", borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  quickSelectContent: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  quickButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: "#f5f5f7", marginRight: 8 },
  quickButtonDark: { backgroundColor: "#3a3a3a" },
  quickButtonActive: { backgroundColor: "#6366f1" },
  quickButtonText: { fontSize: 14, fontWeight: "600", color: "#1a1a1a" },
  quickButtonTextDark: { color: "#e0e0e0" },
  quickButtonTextActive: { color: "#fff" },
  dateFilterContainer: { flexDirection: "row", paddingHorizontal: 24, paddingVertical: 12, backgroundColor: "#fff", gap: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  dateFilterContainerDark: { backgroundColor: "#1a1a1a", borderBottomColor: "#2a2a2a" },
  dateFilterButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#f5f5f7", gap: 8 },
  dateFilterButtonDark: { backgroundColor: "#2a2a2a" },
  dateFilterButtonActive: { backgroundColor: "#e0e7ff" },
  dateFilterText: { fontSize: 14, fontWeight: "600", color: "#666" },
  dateFilterTextDark: { color: "#999" },
  dateFilterTextActive: { color: "#6366f1" },
  content: { flex: 1 },
  listContent: { padding: 20, paddingBottom: 32 },
  eventCard: { backgroundColor: "#fff", borderRadius: 16, marginBottom: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, flexDirection: "row" },
  eventCardDark: { backgroundColor: "#1a1a1a", borderRadius: 16, marginBottom: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 3, flexDirection: "row" },
  eventAccent: { width: 5, backgroundColor: "#6366f1" },
  eventContent: { flex: 1, padding: 18 },
  summary: { fontSize: 18, fontWeight: "700", color: "#1a1a1a", marginBottom: 8, letterSpacing: -0.3 },
  summaryDark: { fontSize: 18, fontWeight: "700", color: "#ffffff", marginBottom: 8, letterSpacing: -0.3 },
  description: { fontSize: 14, color: "#666", lineHeight: 20, marginBottom: 12 },
  descriptionDark: { fontSize: 14, color: "#999", lineHeight: 20, marginBottom: 12 },
  timeContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f5f7", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-start" },
  timeContainerDark: { flexDirection: "row", alignItems: "center", backgroundColor: "#2a2a2a", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-start" },
  timeIcon: { marginRight: 6 },
  timeText: { fontSize: 13, color: "#666", fontWeight: "600" },
  timeTextDark: { fontSize: 13, color: "#999", fontWeight: "600" },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  loader: { padding: 24, alignItems: "center" },
  loaderText: { fontSize: 16, color: "#666", fontWeight: "500", marginTop: 12 },
  loaderTextDark: { color: "#999" },
  emptyTitle: { fontSize: 24, fontWeight: "700", color: "#1a1a1a", marginBottom: 8, marginTop: 16 },
  emptyTitleDark: { fontSize: 24, fontWeight: "700", color: "#ffffff", marginBottom: 8, marginTop: 16 },
  emptyText: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
  emptyTextDark: { fontSize: 16, color: "#999", textAlign: "center", lineHeight: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 0, maxHeight: "90%", minHeight: "90%" },
  modalContentDark: { backgroundColor: "#1a1a1a", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 0, maxHeight: "90%", minHeight: "90%" },
  scrollViewContent: { paddingBottom: 60 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { fontSize: 24, fontWeight: "700", color: "#1a1a1a" },
  modalTitleDark: { color: "#ffffff" },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 16, flex: 1 },
  settingTextContainer: { flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: "600", color: "#1a1a1a", marginBottom: 4 },
  settingLabelDark: { color: "#ffffff" },
  settingSubtext: { fontSize: 13, color: "#666" },
  settingSubtextDark: { color: "#999" },
  separator: { height: 1, backgroundColor: "#f0f0f0", marginVertical: 16 },
  separatorDark: { backgroundColor: "#2a2a2a" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1a1a1a" },
  sectionTitleDark: { color: "#ffffff" },
  sectionSubtext: { fontSize: 13, color: "#666" },
  sectionSubtextDark: { color: "#999" },
  notificationInput: { marginTop: 12 },
  notificationInputDark: { marginTop: 12 },
  timePickerContainer: { marginTop: 12, marginBottom: 8 },
  timePickerContainerDark: { marginTop: 12, marginBottom: 8 },
  timeButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  timeButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#f5f5f7', alignItems: 'center' },
  timeButtonDark: { backgroundColor: '#2a2a2a' },
  timeButtonActive: { backgroundColor: '#6366f1' },
  timeButtonText: { fontSize: 14, fontWeight: '600', color: '#666' },
  timeButtonTextDark: { color: '#999' },
  timeButtonTextActive: { color: '#fff' },
  warningBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fef3c7', padding: 12, borderRadius: 10, marginTop: 12 },
  warningBoxDark: { backgroundColor: '#422006' },
  warningText: { flex: 1, fontSize: 13, color: '#92400e' },
  warningTextDark: { color: '#fbbf24' },
  savedSectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#f5f5f7", borderRadius: 12, marginBottom: 8, marginTop: 12 },
  savedSectionRowDark: { backgroundColor: "#2a2a2a" },
  savedSectionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  savedSectionText: { fontSize: 16, fontWeight: "600", color: "#1a1a1a" },
  savedSectionTextDark: { color: "#ffffff" },
  addSectionButton: { backgroundColor: "#6366f1", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12, flexDirection: "row", justifyContent: "center", gap: 8 },
  addIcon: { marginRight: 4 },
  addSectionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  aboutText: { fontSize: 16, fontWeight: "600", color: "#1a1a1a", marginBottom: 8 },
  aboutTextDark: { color: "#ffffff" },
  aboutSubtext: { fontSize: 14, color: "#666", lineHeight: 20, marginBottom: 12 },
  aboutSubtextDark: { color: "#999" },
  aboutVersion: { fontSize: 12, color: "#999", fontStyle: "italic" },
  aboutVersionDark: { color: "#666" },
  notification: { position: "absolute", top: 60, left: 20, right: 20, flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6, gap: 12, zIndex: 9999 },
  notificationError: { backgroundColor: "#ef4444" },
  notificationInfo: { backgroundColor: "#6366f1" },
  notificationText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
});