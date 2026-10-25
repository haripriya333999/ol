from typing import Dict

def calculate_horizontal_position(box: Dict[str, float], img_width: float) -> str:
    """
    Categorizes the box center into 'left', 'center', or 'right'.
    """
    if img_width <= 0:
        return 'center'
    center_x = box['x'] + (box['width'] / 2.0)
    ratio = center_x / img_width
    if ratio < 0.38:
        return 'left'
    elif ratio > 0.62:
        return 'right'
    return 'center'

def calculate_side_direction(box: Dict[str, float], img_width: float) -> str:
    """
    Calculates natural human directional phrasing for blind users.
    Never uses clock positions.
    """
    if img_width <= 0:
        return 'in the center'
    center_x = box['x'] + (box['width'] / 2.0)
    ratio = center_x / img_width
    if ratio < 0.20:
        return 'to your far left'
    elif ratio < 0.38:
        return 'on your left side'
    elif ratio <= 0.62:
        return 'in the center'
    elif ratio <= 0.80:
        return 'on your right side'
    else:
        return 'to your far right'

def calculate_vertical_level(box: Dict[str, float], img_height: float) -> str:
    """
    Estimates 2D vertical region in the frame: ceiling, eye level, waist level, or floor.
    """
    if img_height <= 0:
        return 'at eye level'
    center_y = box['y'] + (box['height'] / 2.0)
    ratio = center_y / img_height
    if ratio < 0.28:
        return 'up near the ceiling'
    elif ratio < 0.65:
        return 'at eye level'
    elif ratio < 0.85:
        return 'at waist level'
    else:
        return 'down near the floor'

def calculate_prominence(box: Dict[str, float], img_width: float, img_height: float) -> str:
    """
    Estimates whether the object is in foreground, midground, or background based on box area fraction.
    """
    total_area = float(max(1, img_width * img_height))
    box_area = float(box['width'] * box['height'])
    area_ratio = box_area / total_area
    if area_ratio >= 0.22:
        return 'foreground'
    elif area_ratio < 0.05:
        return 'background'
    return 'midground'
