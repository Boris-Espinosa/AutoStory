import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, layout, radius, shadow, spacing, typography } from '../../theme';
import { Icon, IconName } from './Icon';
import { IconButton } from './IconButton';

export interface OverflowMenuItem {
  key: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  icon?: IconName;
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function OverflowMenu({
  items,
  accessibilityLabel = 'Más opciones',
  style,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const { isWide } = useBreakpoint();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!open || Platform.OS !== 'web') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  const renderItems = () =>
    items.map((item, index) => (
      <Pressable
        accessibilityLabel={item.label}
        accessibilityRole="button"
        key={item.key}
        onPress={() => {
          close();
          item.onPress();
        }}
        style={({ pressed }) => [
          styles.item,
          index > 0 && styles.itemBorder,
          pressed && styles.itemPressed,
        ]}
      >
        {item.icon ? (
          <Icon
            color={item.danger ? colors.danger : colors.textSecondary}
            name={item.icon}
            size={20}
          />
        ) : null}
        <Text style={[styles.itemText, item.danger && styles.dangerText]}>
          {item.label}
        </Text>
      </Pressable>
    ));

  return (
    <>
      <IconButton
        accessibilityLabel={accessibilityLabel}
        icon="ellipsis-horizontal"
        onPress={() => setOpen(true)}
        style={style}
      />

      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={open}
      >
        <Pressable
          accessibilityLabel="Cerrar menú"
          accessibilityRole="button"
          onPress={close}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />

        {isWide ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.dropdownContainer,
              { paddingTop: insets.top + layout.headerHeight },
            ]}
          >
            <View style={styles.dropdown}>{renderItems()}</View>
          </View>
        ) : (
          <View
            pointerEvents="box-none"
            style={[styles.sheetContainer, { paddingBottom: insets.bottom }]}
          >
            <View style={styles.sheet}>
              <View style={styles.handle} />
              {renderItems()}
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.overlayLight,
  },
  dropdownContainer: {
    alignItems: 'flex-end',
    bottom: spacing.none,
    justifyContent: 'flex-start',
    left: spacing.none,
    paddingRight: spacing.lg,
    position: 'absolute',
    right: spacing.none,
    top: spacing.none,
  },
  dropdown: {
    ...shadow,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    overflow: 'hidden',
    width: layout.sidebarWidth,
  },
  sheetContainer: {
    bottom: spacing.none,
    justifyContent: 'flex-end',
    left: spacing.none,
    position: 'absolute',
    right: spacing.none,
    top: spacing.none,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: layout.menuHandleHeight,
    marginBottom: spacing.sm,
    width: layout.menuHandleWidth,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
  },
  itemPressed: {
    backgroundColor: colors.primarySoft,
  },
  itemText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  dangerText: {
    color: colors.danger,
    fontWeight: '600',
  },
});
