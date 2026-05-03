import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

const Button = require('react-native-paper/lib/commonjs/components/Button/Button').default as any;
const Dialog = require('react-native-paper/lib/commonjs/components/Dialog/Dialog').default as any;
const Portal = require('react-native-paper/lib/commonjs/components/Portal/Portal').default as any;
const Text = require('react-native-paper/lib/commonjs/components/Typography/Text').default as any;

type FeedbackAction = {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: 'primary' | 'plain' | 'danger';
};

type DialogState = {
  title: string;
  message?: string;
  actions: FeedbackAction[];
  dismissable?: boolean;
};

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'success' | 'danger';
};

type FeedbackValue = {
  toast: (message: string, options?: Omit<ToastState, 'message'>) => void;
  dialog: (state: DialogState) => void;
  confirm: (state: Omit<DialogState, 'actions'> & { confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
  dismissDialog: () => void;
};

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissDialog = useCallback(() => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setDialogState(null);
  }, []);

  const toast = useCallback((message: string, options?: Omit<ToastState, 'message'>) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastState({ message, ...options });
    toastTimerRef.current = setTimeout(() => {
      setToastState(null);
      toastTimerRef.current = null;
    }, 1600);
  }, []);

  const dialog = useCallback((state: DialogState) => {
    setDialogState(state);
  }, []);

  const confirm = useCallback<FeedbackValue['confirm']>(
    (state) =>
      new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
        setDialogState({
          title: state.title,
          message: state.message,
          dismissable: state.dismissable,
          actions: [
            {
              label: state.cancelLabel || '取消',
              variant: 'plain',
              onPress: () => {
                resolve(false);
                confirmResolveRef.current = null;
              },
            },
            {
              label: state.confirmLabel || '确定',
              variant: state.danger ? 'danger' : 'primary',
              onPress: () => {
                resolve(true);
                confirmResolveRef.current = null;
              },
            },
          ],
        });
      }),
    [],
  );

  const value = useMemo(
    () => ({ toast, dialog, confirm, dismissDialog }),
    [confirm, dialog, dismissDialog, toast],
  );

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Portal>
        <Dialog
          visible={!!dialogState}
          dismissable={dialogState?.dismissable !== false}
          onDismiss={dismissDialog}
          style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>{dialogState?.title}</Dialog.Title>
          {dialogState?.message ? (
            <Dialog.Content>
              <Text variant="bodyMedium" style={styles.dialogMessage}>{dialogState.message}</Text>
            </Dialog.Content>
          ) : null}
          <Dialog.Actions style={styles.dialogActions}>
            {(dialogState?.actions || []).map((action) => (
              <Button
                key={action.label}
                mode={action.variant === 'primary' || action.variant === 'danger' ? 'contained' : 'text'}
                buttonColor={action.variant === 'danger' ? '#D92D3A' : action.variant === 'primary' ? '#F02D47' : undefined}
                textColor={action.variant === 'plain' ? '#5C6370' : '#FFFFFF'}
                compact
                onPress={async () => {
                  await action.onPress?.();
                  setDialogState(null);
                }}>
                {action.label}
              </Button>
            ))}
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Modal
        visible={!!toastState}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setToastState(null)}>
        <View pointerEvents="box-none" style={styles.toastRoot}>
          {toastState ? (
            <View style={[styles.toastBubble, toastState.tone === 'success' && styles.toastBubbleSuccess, toastState.tone === 'danger' && styles.toastBubbleDanger]}>
              {toastState.tone === 'success' ? (
                <View style={styles.toastIcon}>
                  <Text style={styles.toastIconText}>✓</Text>
                </View>
              ) : null}
              <Text style={styles.toastText}>{toastState.message}</Text>
              {toastState.actionLabel ? (
                <Pressable
                  hitSlop={8}
                  style={styles.toastAction}
                  onPress={() => {
                    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                    toastTimerRef.current = null;
                    setToastState(null);
                    toastState.onAction?.();
                  }}>
                  <Text style={styles.toastActionText}>{toastState.actionLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used within AppFeedbackProvider');
  return value;
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  dialogTitle: {
    color: '#20242B',
    fontSize: 19,
    fontWeight: '900',
  },
  dialogMessage: {
    color: '#555B66',
    lineHeight: 21,
  },
  dialogActions: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  toastRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2147483647,
    elevation: 2147483647,
  },
  toastBubble: {
    maxWidth: 260,
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  toastBubbleSuccess: {
    backgroundColor: 'rgba(22,125,74,0.92)',
  },
  toastBubbleDanger: {
    backgroundColor: 'rgba(190,38,51,0.92)',
  },
  toastIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  toastIconText: {
    color: '#167D4A',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  toastText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  toastAction: {
    minHeight: 24,
    justifyContent: 'center',
  },
  toastActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
