extends Control
class_name FramedButton
## 主菜单风格的图片框按钮：底层是 SVG 边框（button.svg / button_orange.svg …），
## 前景 icon 靠左 + 描边 label 居中。悬停放大，按下切 pressed 帧。

signal pressed

const FRAMES := {
	"blue": {
		"normal": "res://assets/ui/button/button.svg",
		"pressed": "res://assets/ui/button/button.svg",
	},
	"orange": {
		"normal": "res://assets/ui/button/button_orange.svg",
		"pressed": "res://assets/ui/button/button_orange_pressed.svg",
	},
	"yellow": {
		"normal": "res://assets/ui/button/button_yellow.svg",
		"pressed": "res://assets/ui/button/button_yellow_pressed.svg",
	},
	"gray": {
		"normal": "res://assets/ui/button/button_gray.svg",
		"pressed": "res://assets/ui/button/button_gray_pressed.svg",
	},
	"green": {
		"normal": "res://assets/ui/button/button_green.svg",
		"pressed": "res://assets/ui/button/button_green_pressed.svg",
	},
	"red": {
		"normal": "res://assets/ui/button/button_red.svg",
		"pressed": "res://assets/ui/button/button_red_pressed.svg",
	},
}

@export var color: String = "blue":
	set(v):
		color = v
		_refresh_frame()

@export var label: String = "":
	set(v):
		label = v
		if _label_node:
			_label_node.text = v

@export var icon: Texture2D:
	set(v):
		icon = v
		if _icon_node:
			_icon_node.texture = v
			_icon_node.visible = v != null

@export var label_font_size: int = 22:
	set(v):
		label_font_size = v
		if _label_node:
			_label_node.add_theme_font_size_override("font_size", v)

@export var disabled: bool = false:
	set(v):
		disabled = v
		modulate = Color(0.55, 0.55, 0.55, 0.9) if v else Color.WHITE
		mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if v else Control.CURSOR_POINTING_HAND

var _frame_node: TextureRect
var _icon_node: TextureRect
var _label_node: Label
var _is_pressed: bool = false
var _hovered: bool = false


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	custom_minimum_size = Vector2(240, 72)


func _ready() -> void:
	pivot_offset = size * 0.5
	resized.connect(_update_pivot)
	_build()
	_refresh_frame()


func _update_pivot() -> void:
	pivot_offset = size * 0.5


func _build() -> void:
	_frame_node = TextureRect.new()
	_frame_node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_frame_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_frame_node.stretch_mode = TextureRect.STRETCH_SCALE
	_frame_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame_node)

	_icon_node = TextureRect.new()
	_icon_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon_node.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_icon_node.anchor_left = 0.0
	_icon_node.anchor_top = 0.5
	_icon_node.anchor_right = 0.0
	_icon_node.anchor_bottom = 0.5
	_icon_node.offset_left = 14.0
	_icon_node.offset_top = -22.0
	_icon_node.offset_right = 58.0
	_icon_node.offset_bottom = 22.0
	_icon_node.texture = icon
	_icon_node.visible = icon != null
	add_child(_icon_node)

	_label_node = Label.new()
	_label_node.text = label
	_label_node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_label_node.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label_node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label_node.add_theme_font_size_override("font_size", label_font_size)
	_label_node.add_theme_color_override("font_color", Color(1, 1, 1))
	_label_node.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	_label_node.add_theme_constant_override("outline_size", 6)
	add_child(_label_node)


func _refresh_frame() -> void:
	if not _frame_node:
		return
	var pair: Dictionary = FRAMES.get(color, FRAMES["blue"]) as Dictionary
	var path: String = pair["pressed"] if _is_pressed else pair["normal"]
	if ResourceLoader.exists(path):
		_frame_node.texture = load(path)


func _gui_input(event: InputEvent) -> void:
	if disabled:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var mb: InputEventMouseButton = event
		if mb.pressed:
			_is_pressed = true
			_refresh_frame()
		else:
			var was_pressed: bool = _is_pressed
			_is_pressed = false
			_refresh_frame()
			if was_pressed and _hovered:
				pressed.emit()


func _notification(what: int) -> void:
	if what == NOTIFICATION_MOUSE_ENTER:
		_hovered = true
		if not disabled:
			create_tween().tween_property(self, "scale", Vector2(1.05, 1.05), 0.1)
	elif what == NOTIFICATION_MOUSE_EXIT:
		_hovered = false
		_is_pressed = false
		_refresh_frame()
		create_tween().tween_property(self, "scale", Vector2.ONE, 0.1)
