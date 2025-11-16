/**
 * QueuedOperationsManager Component
 *
 * Manages the display of queued operations indicator and modal.
 * This component is placed in _layout.tsx to be available globally.
 *
 * @example
 * ```tsx
 * import { QueuedOperationsManager } from '@/components/QueuedOperationsManager';
 *
 * <QueuedOperationsManager />
 * ```
 */

import React, { useState } from 'react';
import { QueuedOperationsIndicator } from './QueuedOperationsIndicator';
import { QueuedOperationsModal } from './QueuedOperationsModal';

export const QueuedOperationsManager: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <QueuedOperationsIndicator onPress={() => setModalVisible(true)} />
      <QueuedOperationsModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
};
