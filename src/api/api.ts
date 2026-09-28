import type {
  AddWaterResponse,
  AnalyzeMealRequest,
  AnalyzeMealResponse,
  AuthTokens,
  BarcodeResponse,
  CreateActivityRequest,
  CreateFavouriteRequest,
  CreateMealRequest,
  Day,
  Devices,
  ExportResponse,
  Favourite,
  HealthSyncRequest,
  HealthSyncResponse,
  Me,
  Meal,
  MovementOverview,
  NutritionStats,
  ParseTextResponse,
  PersonalityRequest,
  Profile,
  PushTokenRequest,
  Quota,
  Reminders,
  SleepOverview,
  Targets,
  Tip,
  TonePreference,
  UpdateMealRequest,
  WeeklyQuestion,
  Workout,
} from '@shared/api';

/** Everything the app can ask the backend. Implemented by HttpApi and MockApi. */
export interface Api {
  // auth
  requestMagicLink(email: string): Promise<{ devToken?: string }>;
  verifyMagicLink(token: string): Promise<AuthTokens>;
  signInWithGoogle(idToken: string): Promise<AuthTokens>;
  signInWithApple(identityToken: string, firstName?: string): Promise<AuthTokens>;
  logout(): Promise<void>;

  // profile
  me(): Promise<Me>;
  updateProfile(p: Partial<Profile>): Promise<Me>;
  updateTargets(t: Partial<Targets>): Promise<Me>;
  setTone(preference: TonePreference): Promise<Me>;
  updateReminders(r: Partial<Reminders>): Promise<Me>;
  updateDevices(d: Partial<Devices>): Promise<Me>;
  completeOnboarding(): Promise<Me>;
  submitPersonality(req: PersonalityRequest): Promise<Me>;
  deletePersonality(): Promise<Me>;
  exportData(): Promise<ExportResponse>;
  deleteAccount(): Promise<void>;
  quota(): Promise<Quota>;

  // day
  day(date: string): Promise<Day>;
  addWater(date: string, ml: number): Promise<AddWaterResponse>;
  addWeight(date: string, kg: number): Promise<{ date: string; kg: number }>;

  // nutrition
  analyzeMeal(req: AnalyzeMealRequest): Promise<AnalyzeMealResponse>;
  parseText(text: string): Promise<ParseTextResponse>;
  barcode(ean: string): Promise<BarcodeResponse>;
  createMeal(req: CreateMealRequest): Promise<Meal>;
  updateMeal(id: string, req: UpdateMealRequest): Promise<Meal>;
  deleteMeal(id: string): Promise<void>;
  favourites(): Promise<Favourite[]>;
  createFavourite(req: CreateFavouriteRequest): Promise<Favourite>;
  deleteFavourite(id: string): Promise<void>;
  nutritionStats(date: string, days?: number): Promise<NutritionStats>;

  // health
  healthSync(req: HealthSyncRequest): Promise<HealthSyncResponse>;
  movement(date: string, days?: number): Promise<MovementOverview>;
  sleep(date: string): Promise<SleepOverview>;
  createActivity(req: CreateActivityRequest): Promise<Workout>;

  // AI copy
  tipToday(date: string): Promise<Tip>;
  tipNext(date: string): Promise<Tip>;
  acceptTip(id: string): Promise<Tip>;
  weeklyQuestion(date: string): Promise<WeeklyQuestion | null>;
  answerWeeklyQuestion(id: string, optionIndex: number): Promise<WeeklyQuestion>;

  // push
  registerPushToken(req: PushTokenRequest): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
