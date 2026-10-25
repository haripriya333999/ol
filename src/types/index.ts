export interface BoundingBox {
  x: number;      // x coordinate (left)
  y: number;      // y coordinate (top)
  width: number;  // width
  height: number; // height
}

export type HorizontalPosition = 'left' | 'center' | 'right';

export interface Detection {
  id: string;
  label: string;
  confidence: number; // 0.0 to 1.0
  box: BoundingBox;
  position: HorizontalPosition;
  sideDirection?: string;      // e.g. "on your left side", "in the center", "on your right side"
  verticalPosition?: string;   // e.g. "up near the ceiling", "at eye level", "at waist level", "down near the floor"
  prominence?: 'foreground' | 'midground' | 'background';
  activityOrDetails?: string;  // e.g. "making thumbs-down gesture with eyeglasses", "closed beige wooden door with latch"
  attributes?: {
    color?: string;
    state?: string;
    material?: string;
  };
  normalizedBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OpenCVQuality {
  opencv_version: string;
  is_opencv_5: boolean;
  width: number;
  height: number;
  blur_score: number;
  laplacian_variance?: number;
  sharpness_variance?: number;
  is_blurry: boolean;
  mean_luminance: number;
  illumination_score?: number;
  contrast_std: number;
  glare_ratio: number;
  glare_detected: boolean;
  is_too_dark: boolean;
  is_low_light?: boolean;
  is_overexposed: boolean;
  clahe_applied: boolean;
  low_light_applied?: boolean;
  enhancement_type?: string;
  speech_guidance: string;
  processing_time_ms: number;
  enhanced_image?: string | null;
}

export type OpenCVQualityMetrics = OpenCVQuality;

export interface DescribeResponse {
  success: boolean;
  message: string;
  detections: Detection[];
  scene_description: string;
  navigation_guidance?: string;
  human_activities?: string;
  visible_text?: string;
  scene_setting?: string;
  structural_elements?: string[];
  uncertain_elements?: string[];
  total_objects_count: number;
  processing_time_ms: number;
  model_status: string;
  lighting_level?: string;
  lighting_advice?: string;
  opencv_version?: string;
  opencv_quality?: OpenCVQuality;
}

export interface FindResponse {
  success: boolean;
  message: string;
  requested_object: string;
  is_category_supported: boolean;
  found: boolean;
  instances_count?: number;
  matches: Detection[];
  position?: HorizontalPosition;
  side_direction?: string;
  vertical_position?: string;
  confidence?: number;
  spoken_summary: string;
  processing_time_ms: number;
  model_status: string;
  all_candidates?: Detection[];
  sub_threshold_candidates?: Detection[];
  threshold_used?: number;
  has_sub_threshold?: boolean;
  agentic_guidance?: string;
  scene_context?: string;
  search_attempt?: number;
  opencv_version?: string;
  opencv_quality?: OpenCVQuality;
}

export interface OCRLine {
  text: string;
  confidence: number;
  box?: BoundingBox;
}

export interface OCRResponse {
  success: boolean;
  message: string;
  extracted_text: string;
  primary_heading?: string;
  critical_information?: string[];
  ambiguous_segments?: string[];
  lines: OCRLine[];
  summary?: string;
  word_count: number;
  processing_time_ms: number;
  engine_ready: boolean;
  model_status: string;
  opencv_version?: string;
  opencv_quality?: OpenCVQuality;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'offline';
  model_name: string;
  detector_ready: boolean;
  ocr_ready: boolean;
  gemini_vision_active?: boolean;
  supported_classes_count: number | string;
  version: string;
  opencv_version?: string;
  opencv5_ready?: boolean;
}

export type ActiveTask = 'home' | 'describe' | 'find' | 'read' | 'live' | 'settings' | 'about';

export type EngineMode = 'gemini-vision' | 'python-fastapi' | 'web-ml';

export interface AccessibilitySettings {
  fontSize: 'normal' | 'large' | 'extra-large';
  highContrast: boolean;
  reduceMotion: boolean;
  speechRate: number;
  speechPitch: number;
  autoSpeakResults: boolean;
  announcePosition: boolean;
  soundEffects: boolean;
  invertLeftRight: boolean; // Laptop camera / webcam mirror perspective (swaps left & right directions)
}

// Broad supported everyday, architectural, room, and campus classes
export const SUPPORTED_EVERYDAY_CLASSES: string[] = [
  // Architectural & Structural
  'door', 'closed door', 'open door', 'doorway', 'door handle', 'door latch',
  'ladder', 'folding ladder', 'step ladder', 'stepladder', 'aluminum ladder',
  'window', 'grilled window', 'glass window', 'ventilator', 'curtain', 'window blinds',
  'wall', 'corridor', 'hallway', 'stairs', 'staircase', 'steps', 'railing', 'pillar',
  
  // Overhead & Electrical
  'ceiling fan', 'table fan', 'fan', 'exhaust fan',
  'light', 'tube light', 'bulb', 'lamp', 'ceiling light',
  'switchboard', 'switch', 'socket', 'plug',
  
  // Furniture & Room Fixtures
  'chair', 'armchair', 'office chair', 'study desk', 'desk', 'table', 'dining table',
  'bed', 'cot', 'couch', 'sofa', 'wardrobe', 'cupboard', 'shelf', 'mirror', 'clock',
  'dustbin', 'trash can', 'waste basket', 'sink', 'tap',
  
  // Clothing & Personal Items
  'clothes', 'shirt', 'dress', 'garment', 'laundry', 'jacket', 't-shirt',
  'glasses', 'spectacles', 'eyewear', 'sunglasses',
  'shoes', 'slippers', 'sandals', 'footwear',
  'backpack', 'bag', 'handbag', 'wallet', 'purse', 'suitcase',
  'umbrella', 'parasol',
  'water bottle', 'bottle', 'flask', 'cup', 'mug', 'tumbler', 'snack packet', 'food packet',
  
  // Electronics
  'cell phone', 'phone', 'smartphone', 'laptop', 'computer', 'screen', 'monitor', 'tv', 'keyboard', 'mouse',
  
  // Persons & Activities
  'person', 'man', 'woman', 'girl', 'boy', 'student', 'teacher',
  
  // Classroom & Public Campus
  'whiteboard', 'blackboard', 'notice board', 'projector', 'podium', 'bench',
  'water dispenser', 'water purifier', 'water cooler', 'exit sign', 'fire extinguisher',
  'book', 'notebook', 'pen', 'pencil'
];

export const COCO_CLASSES = SUPPORTED_EVERYDAY_CLASSES;
