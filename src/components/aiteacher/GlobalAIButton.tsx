// The floating AI button on every screen. Mounted once in App, over the navigator (like <AskAIHost />), so it does
// not belong to any one screen. Tapping it opens Ask AI with a plan, otherwise the plans. The student can drag it
// out of the way; where they leave it is remembered.
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebar } from '../../context/SidebarContext';
import { useAuth } from '../../context/AuthContext';
import { useAiTeacherPlan } from '../../services/aiTeacherPlan';
import { clampPlacement, parsePlacement, shouldShowAIFab, type FabBox, type FabPlacement } from '../../services/aiFab';
import { openAskAI, useAskAIRequest } from '../../services/askAIStore';
import { useCurrentRouteName } from '../../services/currentRoute';
import { tabBarTop } from '../CustomTabBar';
import { AITeacherFab } from './AITeacherFab';
import { navigationRef } from '../../navigation/AppNavigator';

const PLACEMENT_KEY = '@ai_fab_placement';
const FAB_SIZE = 64;

export function GlobalAIButton() {
  const insets = useSafeAreaInsets();
  const routeName = useCurrentRouteName();
  const askOpen = useAskAIRequest() !== null;
  const { isOpen: sidebarOpen } = useSidebar();
  const { user } = useAuth();
  // Re-checked on every route change, so a purchase made on another screen is picked up here.
  const { state: planState, refresh: refreshPlan } = useAiTeacherPlan(!!user);
  useEffect(() => {
    refreshPlan();
  }, [routeName, refreshPlan]);
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

  // Only a server answer of "no plan" goes to the plans page. Active, unknown or still loading opens Ask AI,
  // which shows its own spinner or retry message.
  const open = useCallback(() => {
    if (planState === 'inactive') navigationRef.current?.navigate('AITeacherPlus');
    else openAskAI();
  }, [planState]);

  const landscape = !!box && box.width > box.height;
  const visible = loaded && !!box && shouldShowAIFab({ routeName, askOpen, sidebarOpen, landscape });
  const placement = saved ?? { edge: 'right' as const, bottom: tabBarTop(insets.bottom) + 14 };

  return (
    <View pointerEvents="box-none" style={styles.overlay} onLayout={onLayout}>
      {visible && box && (
        <AITeacherFab
          hasActivePlan={planState !== 'inactive'}
          onPress={open}
          box={box}
          placement={clampPlacement(placement, box, insets, FAB_SIZE)}
          onPlacementChange={onPlacementChange}
        />
      )}
    </View>
  );
}

export default GlobalAIButton;

const styles = StyleSheet.create({
  // Over the navigator, but only the button takes touches (box-none).
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
});
