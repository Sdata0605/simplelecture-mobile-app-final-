// The floating AI button on every screen. Mounted once in App, over the navigator (like <AskAIHost />), so it does
// not belong to any one screen. Tapping it opens Ask AI with a plan, otherwise the plans. The student can drag it
// out of the way; where they leave it is remembered.
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebar } from '../../context/SidebarContext';
import { aiTeacherDestination } from '../../services/aiTeacherPromo';
import { useAITeacherSubscription } from '../../services/aiTeacherSubscription';
import { clampPlacement, parsePlacement, shouldShowAIFab, type FabBox, type FabPlacement } from '../../services/aiFab';
import { openAskAI, useAskAIRequest } from '../../services/askAIStore';
import { useCurrentRouteName } from '../../services/currentRoute';
import { tabBarTop } from '../CustomTabBar';
import { AITeacherFab } from './AITeacherFab';
import { AITeacherPlanModal } from './AITeacherPlanModal';

const PLACEMENT_KEY = '@ai_fab_placement';
const FAB_SIZE = 64;

export function GlobalAIButton() {
  const insets = useSafeAreaInsets();
  const routeName = useCurrentRouteName();
  const askOpen = useAskAIRequest() !== null;
  const { isOpen: sidebarOpen } = useSidebar();
  const { hasActivePlan } = useAITeacherSubscription();
  const [plansOpen, setPlansOpen] = useState(false);
  const [box, setBox] = useState<FabBox | null>(null);
  // What the student chose; until they drag it, it rests just above the tab bar, on the right.
  const [saved, setSaved] = useState<FabPlacement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PLACEMENT_KEY)
      .then((raw) => setSaved(parsePlacement(raw)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const onPlacementChange = useCallback((placement: FabPlacement) => {
    setSaved(placement);
    AsyncStorage.setItem(PLACEMENT_KEY, JSON.stringify(placement)).catch(() => {});
  }, []);

  // The Ask AI screen (the one the lecture player has) with a plan, otherwise the plans.
  const open = useCallback(() => {
    if (aiTeacherDestination(hasActivePlan) === 'teacher') openAskAI();
    else setPlansOpen(true);
  }, [hasActivePlan]);

  const landscape = !!box && box.width > box.height;
  const visible = loaded && !!box && shouldShowAIFab({ routeName, askOpen, sidebarOpen, landscape });
  const placement = saved ?? { edge: 'right' as const, bottom: tabBarTop(insets.bottom) + 14 };

  return (
    <View pointerEvents="box-none" style={styles.overlay} onLayout={onLayout}>
      {visible && box && (
        <AITeacherFab
          hasActivePlan={hasActivePlan}
          onPress={open}
          box={box}
          placement={clampPlacement(placement, box, insets, FAB_SIZE)}
          onPlacementChange={onPlacementChange}
        />
      )}
      <AITeacherPlanModal visible={plansOpen} onClose={() => setPlansOpen(false)} />
    </View>
  );
}

export default GlobalAIButton;

const styles = StyleSheet.create({
  // Over the navigator, but only the button takes touches (box-none).
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
});
