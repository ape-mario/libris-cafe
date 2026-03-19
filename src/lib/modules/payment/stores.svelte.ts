import type { PaymentStatus } from './types';

interface ActivePayment {
  orderId: string;
  transactionId: string;
  status: PaymentStatus;
  snapToken: string | null;
}

let activePayment = $state<ActivePayment | null>(null);
let paymentPolling = $state(false);

export function getActivePayment(): ActivePayment | null {
  return activePayment;
}

export function setActivePayment(payment: ActivePayment | null): void {
  activePayment = payment;
}

export function isPaymentInProgress(): boolean {
  return activePayment !== null && activePayment.status === 'pending';
}

export function getPaymentPolling(): boolean {
  return paymentPolling;
}

export function setPaymentPolling(polling: boolean): void {
  paymentPolling = polling;
}

export function clearActivePayment(): void {
  activePayment = null;
  paymentPolling = false;
}
