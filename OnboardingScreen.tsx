import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type OnboardingSlide = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  description: string;
  color: string;
};

const slides: OnboardingSlide[] = [
  {
    icon: "schedule",
    title: "Variazioni in Tempo Reale",
    description: "Visualizza le variazioni dell'orario giornaliero della tua classe e dei tuoi professori, sempre aggiornate.",
    color: "#6366f1",
  },
  {
    icon: "notifications-active",
    title: "Notifiche Push",
    description: "Ricevi notifiche istantanee quando vengono pubblicate nuove variazioni per la tua classe o i tuoi professori.",
    color: "#8b5cf6",
  },
  {
    icon: "bookmark",
    title: "Accesso Rapido",
    description: "Salva le tue classi e professori preferiti per un accesso immediato alle loro variazioni.",
    color: "#ec4899",
  },
  {
    icon: "event-available",
    title: "Tutto Pronto!",
    description: "Inizia subito a monitorare le variazioni. Inserisci la tua classe o il nome del professore per cominciare.",
    color: "#10b981",
  },
];

type OnboardingScreenProps = {
  onComplete: () => void;
  isDark?: boolean;
};

export default function OnboardingScreen({ onComplete, isDark = false }: OnboardingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goToNext = () => {
    if (currentIndex < slides.length - 1) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex(currentIndex + 1);
        slideAnim.setValue(50);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      onComplete();
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex(currentIndex - 1);
        slideAnim.setValue(-50);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  };

  const skip = () => {
    onComplete();
  };

  const currentSlide = slides[currentIndex];
  const isLastSlide = currentIndex === slides.length - 1;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#0f0f0f" : "#fff"} />
      
      {/* Skip Button */}
      {!isLastSlide && (
        <TouchableOpacity style={styles.skipButton} onPress={skip} activeOpacity={0.7}>
          <Text style={[styles.skipText, isDark && styles.skipTextDark]}>Salta</Text>
        </TouchableOpacity>
      )}

      {/* Content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Icon Circle */}
        <View style={[styles.iconCircle, { backgroundColor: currentSlide.color + "20" }]}>
          <MaterialIcons name={currentSlide.icon} size={80} color={currentSlide.color} />
        </View>

        {/* Title */}
        <Text style={[styles.title, isDark && styles.titleDark]}>{currentSlide.title}</Text>

        {/* Description */}
        <Text style={[styles.description, isDark && styles.descriptionDark]}>
          {currentSlide.description}
        </Text>
      </Animated.View>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.dotActive,
              currentIndex === index && { backgroundColor: currentSlide.color },
              isDark && styles.dotDark,
            ]}
          />
        ))}
      </View>

      {/* Navigation Buttons */}
      <View style={styles.navigation}>
        {currentIndex > 0 && (
          <TouchableOpacity
            style={[styles.navButton, styles.backButton, isDark && styles.navButtonDark]}
            onPress={goToPrev}
            activeOpacity={0.8}
          >
            <MaterialIcons name="arrow-back" size={24} color={isDark ? "#fff" : "#1a1a1a"} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.navButton,
            styles.nextButton,
            { backgroundColor: currentSlide.color },
            currentIndex === 0 && styles.nextButtonFull,
          ]}
          onPress={goToNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? "Inizia" : "Avanti"}
          </Text>
          <MaterialIcons name={isLastSlide ? "check" : "arrow-forward"} size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  containerDark: {
    backgroundColor: "#0f0f0f",
  },
  skipButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  skipTextDark: {
    color: "#999",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  titleDark: {
    color: "#fff",
  },
  description: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
    lineHeight: 28,
    paddingHorizontal: 20,
  },
  descriptionDark: {
    color: "#999",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e0e0e0",
  },
  dotDark: {
    backgroundColor: "#3a3a3a",
  },
  dotActive: {
    width: 32,
    borderRadius: 5,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  backButton: {
    backgroundColor: "#f5f5f7",
    flex: 0,
  },
  navButtonDark: {
    backgroundColor: "#2a2a2a",
  },
  nextButton: {
    flex: 1,
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});