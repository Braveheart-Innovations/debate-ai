import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import { LogViewer } from './LogViewer';
import { NetworkInspector } from './NetworkInspector';
import { StateInspector } from './StateInspector';
import { FeatureFlags } from './FeatureFlags';

interface DebugMenuProps {
  visible: boolean;
  onClose: () => void;
}

type TabType = 'logs' | 'network' | 'state' | 'flags';

interface TabItem {
  key: TabType;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { key: 'logs', label: 'Logs', icon: '📝' },
  { key: 'network', label: 'Network', icon: '🌐' },
  { key: 'state', label: 'State', icon: '🗃️' },
  { key: 'flags', label: 'Flags', icon: '🚩' },
];

export const DebugMenu: React.FC<DebugMenuProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'logs':
        return <LogViewer />;
      case 'network':
        return <NetworkInspector />;
      case 'state':
        return <StateInspector />;
      case 'flags':
        return <FeatureFlags />;
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Header */}
        <Box
          style={[
            styles.header,
            { borderBottomColor: theme.colors.border },
          ]}
        >
          <Typography variant="title" style={styles.title}>
            Debug Menu
          </Typography>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Typography style={styles.closeText}>Close</Typography>
          </TouchableOpacity>
        </Box>

        {/* Tab Bar */}
        <Box style={[styles.tabBar, { borderBottomColor: theme.colors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabContainer}
          >
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tab,
                  activeTab === tab.key && {
                    borderBottomColor: theme.colors.primary[500],
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Typography style={styles.tabIcon}>{tab.icon}</Typography>
                <Typography
                  variant="caption"
                  color={activeTab === tab.key ? 'primary' : 'secondary'}
                  style={styles.tabLabel}
                >
                  {tab.label}
                </Typography>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Box>

        {/* Content */}
        <Box style={styles.content}>{renderTabContent()}</Box>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: '#007AFF',
  },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabContainer: {
    paddingHorizontal: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  tabIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
});
