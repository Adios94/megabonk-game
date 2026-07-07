extends Control
class_name SilverBadge
## 银币徽标：左侧硬币图标叠在深蓝药丸左端，右侧描边数字。
## 对应 main 分支 createSilverBadge()。

const COIN_ICON_PATH := "res://assets/ui/icon/coin_silver.png"
const COIN_SIZE := 34.0
const PILL_HEIGHT := 24.0
const PILL_LEFT_INSET := 16.0  # 药丸左端插入硬币中心的量
const PILL_MIN_WIDTH := 90.0

@export var amount: int = 0:
	set(v):
		amount = v
		_refresh_amount()

@export var prefix: String = "":
	set(v):
		prefix = v
		_refresh_amount()

var _coin: TextureRect
var _pill: PanelContainer
var _label: Label


func _init() -> void:
	custom_minimum_size = Vector2(140, COIN_SIZE)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	_build()
	_refresh_amount()


func _build() -> void:
	# 药丸容器：从硬币中心开始向右延伸，纵向居中。
	_pill = PanelContainer.new()
	_pill.anchor_left = 0.0
	_pill.anchor_right = 1.0
	_pill.anchor_top = 0.5
	_pill.anchor_bottom = 0.5
	_pill.offset_left = COIN_SIZE * 0.5 - PILL_LEFT_INSET
	_pill.offset_right = 0.0
	_pill.offset_top = -PILL_HEIGHT * 0.5
	_pill.offset_bottom = PILL_HEIGHT * 0.5
	_pill.custom_minimum_size = Vector2(PILL_MIN_WIDTH, PILL_HEIGHT)
	_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pill_style := StyleBoxFlat.new()
	pill_style.bg_color = Color("#1a3a6e")
	pill_style.set_corner_radius_all(999)
	pill_style.content_margin_left = 22
	pill_style.content_margin_right = 12
	pill_style.content_margin_top = 2
	pill_style.content_margin_bottom = 2
	_pill.add_theme_stylebox_override("panel", pill_style)
	add_child(_pill)

	_label = Label.new()
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.add_theme_font_size_override("font_size", 18)
	_label.add_theme_color_override("font_color", Color.WHITE)
	_label.add_theme_color_override("font_outline_color", Color.BLACK)
	_label.add_theme_constant_override("outline_size", 4)
	_pill.add_child(_label)

	# 硬币：贴 badge 左端居中，覆盖药丸左半。
	_coin = TextureRect.new()
	_coin.anchor_left = 0.0
	_coin.anchor_right = 0.0
	_coin.anchor_top = 0.5
	_coin.anchor_bottom = 0.5
	_coin.offset_left = 0.0
	_coin.offset_right = COIN_SIZE
	_coin.offset_top = -COIN_SIZE * 0.5
	_coin.offset_bottom = COIN_SIZE * 0.5
	_coin.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_coin.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_coin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if ResourceLoader.exists(COIN_ICON_PATH):
		_coin.texture = load(COIN_ICON_PATH)
	add_child(_coin)


func _refresh_amount() -> void:
	if _label:
		_label.text = "%s%d" % [prefix, amount]
