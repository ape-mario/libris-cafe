import type { Notification } from './types';

let notifications = $state<Notification[]>([]);
let unreadCount = $state(0);

export function getNotifications(): Notification[] {
  return notifications;
}

export function setNotifications(list: Notification[]): void {
  notifications = list;
}

export function addNotification(notif: Notification): void {
  notifications = [notif, ...notifications];
}

export function getUnreadCount(): number {
  return unreadCount;
}

export function setUnreadCount(count: number): void {
  unreadCount = count;
}

export function incrementUnread(): void {
  unreadCount++;
}

export function decrementUnread(): void {
  if (unreadCount > 0) unreadCount--;
}

export function markNotificationRead(id: string): void {
  notifications = notifications.map(n =>
    n.id === id ? { ...n, read: true } : n
  );
  decrementUnread();
}

export function clearNotifications(): void {
  notifications = [];
  unreadCount = 0;
}
