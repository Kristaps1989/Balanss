import { Platform } from 'react-native';

/**
 * Pro subscriptions through RevenueCat (Google Play Billing / StoreKit).
 * The backend learns about purchases from the RevenueCat webhook and flips
 * `plan` to "pro"; the app only starts the purchase and refreshes `me`.
 */
const KEY = Platform.select({
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  default: undefined,
});

export const billingAvailable = Platform.OS !== 'web' && !!KEY;

export type PlanId = 'year' | 'month';

export interface PlanOffer {
  id: PlanId;
  price: string;
}

type RC = typeof import('react-native-purchases').default;

let configuredFor: string | null = null;
function rc(userId: string): RC {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Purchases = (require('react-native-purchases') as typeof import('react-native-purchases')).default;
  if (configuredFor !== userId) {
    Purchases.configure({ apiKey: KEY!, appUserID: userId });
    configuredFor = userId;
  }
  return Purchases;
}

/** Store prices for the current offering (falls back to list prices). */
export async function loadOffers(userId: string): Promise<PlanOffer[]> {
  const fallback: PlanOffer[] = [
    { id: 'year', price: '€49/gadā' },
    { id: 'month', price: '€5,99/mēn.' },
  ];
  if (!billingAvailable) return fallback;
  const off = await rc(userId).getOfferings();
  const cur = off.current;
  if (!cur) return fallback;
  return [
    { id: 'year', price: cur.annual ? `${cur.annual.product.priceString}/gadā` : fallback[0].price },
    { id: 'month', price: cur.monthly ? `${cur.monthly.product.priceString}/mēn.` : fallback[1].price },
  ];
}

/** Returns true when the purchase went through, false if the user cancelled. */
export async function purchase(userId: string, plan: PlanId): Promise<boolean> {
  if (!billingAvailable) throw new Error('Billing not configured');
  const Purchases = rc(userId);
  const cur = (await Purchases.getOfferings()).current;
  const pkg = plan === 'year' ? cur?.annual : cur?.monthly;
  if (!pkg) throw new Error('No package');
  try {
    await Purchases.purchasePackage(pkg);
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(userId: string) {
  if (!billingAvailable) return;
  await rc(userId).restorePurchases();
}
