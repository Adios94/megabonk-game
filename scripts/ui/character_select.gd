extends Control
## 角色选择页：对应旧 main 分支 showCharacterSelectScreen()。
## 左边 avatar rail、中间立绘、右侧详情卡 + 底部难度行 + 确认按钮。

const FramedButton := preload("res://scripts/ui/framed_button.gd")

const CHARS := [
	{
		"id": "megachad",
		"name_key": "character.megachad",
		"desc_key": "character.megachad_desc",
		"trait_key": "character.megachad_trait",
		"full": "res://assets/ui/characters/megachad_full.webp",
		"avatar_normal": "res://assets/ui/characters/megachad_avatar_normal.png",
		"avatar_selected": "res://assets/ui/characters/megachad_avatar_selected.png",
	},
	{
		"id": "roberto",
		"name_key": "character.roberto",
		"desc_key": "character.roberto_desc",
		"trait_key": "character.roberto_trait",
		"full": "res://assets/ui/characters/roberto_full.webp",
		"avatar_normal": "res://assets/ui/characters/roberto_avatar_normal.png",
		"avatar_selected": "res://assets/ui/characters/roberto_avatar_selected.png",
	},
	{
		"id": "skateboard_skeleton",
		"name_key": "character.skateboard_skeleton",
		"desc_key": "character.skateboard_skeleton_desc",
		"trait_key": "character.skateboard_skeleton_trait",
		"full": "res://assets/ui/characters/skateboard_skeleton_full.webp",
		"avatar_normal": "res://assets/ui/characters/skateboard_skeleton_avatar_normal.png",
		"avatar_selected": "res://assets/ui/characters/skateboard_skeleton_avatar_selected.png",
	},
]

const TIERS := [
	{"id": 1, "label_key": "tier.1", "icon": "res://assets/ui/icon/difficulty_normal.png"},
	{"id": 2, "label_key": "tier.2", "icon": "res://assets/ui/icon/difficulty_hard.png"},
	{"id": 3, "label_key": "tier.3", "icon": "res://assets/ui/icon/difficulty_nightmare.png"},
]

const LOCKED_OVERLAY := "res://assets/ui/characters/locked_character.png"

@onready var _rail: VBoxContainer = $Body/Rail
@onready var _preview: TextureRect = $Body/Center/Preview
@onready var _name_lbl: Label = $Body/Detail/Margin/VBox/NameLabel
@onready var _desc_lbl: Label = $Body/Detail/Margin/VBox/DescLabel
@onready var _trait_title: Label = $Body/Detail/Margin/VBox/TraitTitle
@onready var _trait_lbl: Label = $Body/Detail/Margin/VBox/TraitLabel
@onready var _tier_row: HBoxContainer = $Bottom/TierRow
@onready var _confirm_btn = $Bottom/ConfirmBtn
@onready var _back_btn = $Header/BackBtn
@onready var _title_lbl: Label = $Header/Title
@onready var _silver_badge = $Header/SilverBadge

var _selected_char_idx: int = 0
var _selected_tier: int = 1
var _avatar_slots: Array[Control] = []
var _tier_buttons: Array = []


func _ready() -> void:
	_title_lbl.text = I18n.t("menu.selectCharacter")
	_back_btn.label = I18n.t("characterSelect.back")
	_trait_title.text = I18n.t("characterSelect.traitTitle")
	_back_btn.pressed.connect(_on_back)
	_confirm_btn.pressed.connect(_on_confirm)
	if _silver_badge:
		_silver_badge.amount = SaveGame.get_silver()
	_build_rail()
	_build_tier_row()
	_selected_char_idx = _find_char_idx(GameManager.selected_character)
	_selected_tier = clamp(GameManager.selected_tier, 1, TIERS.size())
	_refresh_selection()


func _find_char_idx(id: String) -> int:
	for i in CHARS.size():
		if CHARS[i]["id"] == id:
			return i
	return 0


func _unlocked_ids() -> Array:
	return SaveGame.data.get("characters_unlocked", []) as Array


func _build_rail() -> void:
	for child in _rail.get_children():
		child.queue_free()
	_avatar_slots.clear()
	var unlocked: Array = _unlocked_ids()
	for i in CHARS.size():
		var c: Dictionary = CHARS[i]
		var slot: Control = _make_avatar_slot(c, i, c["id"] in unlocked)
		_rail.add_child(slot)
		_avatar_slots.append(slot)


func _make_avatar_slot(c: Dictionary, idx: int, unlocked: bool) -> Control:
	var slot: Control = Control.new()
	slot.custom_minimum_size = Vector2(120, 120)
	slot.pivot_offset = Vector2(60, 60)

	var frame: TextureRect = TextureRect.new()
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var normal_path: String = c["avatar_normal"]
	if ResourceLoader.exists(normal_path):
		frame.texture = load(normal_path)
	frame.name = "Frame"
	slot.add_child(frame)

	if not unlocked and ResourceLoader.exists(LOCKED_OVERLAY):
		var lock: TextureRect = TextureRect.new()
		lock.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		lock.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		lock.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		lock.texture = load(LOCKED_OVERLAY)
		lock.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(lock)

	var btn: Button = Button.new()
	btn.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	btn.flat = true
	btn.disabled = not unlocked
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if unlocked else Control.CURSOR_FORBIDDEN
	btn.pressed.connect(_on_avatar_pressed.bind(idx))
	slot.add_child(btn)

	slot.set_meta("unlocked", unlocked)
	return slot


func _on_avatar_pressed(idx: int) -> void:
	Audio.play_sfx("ui_click")
	_selected_char_idx = idx
	_refresh_selection()


func _refresh_selection() -> void:
	for i in _avatar_slots.size():
		var slot: Control = _avatar_slots[i]
		var frame: TextureRect = slot.get_node("Frame") as TextureRect
		var c: Dictionary = CHARS[i]
		var path: String = c["avatar_selected"] if i == _selected_char_idx else c["avatar_normal"]
		if ResourceLoader.exists(path):
			frame.texture = load(path)
		slot.scale = Vector2(1.1, 1.1) if i == _selected_char_idx else Vector2.ONE

	var cur: Dictionary = CHARS[_selected_char_idx]
	if ResourceLoader.exists(cur["full"]):
		_preview.texture = load(cur["full"])
	var unlocked: bool = cur["id"] in _unlocked_ids()
	_preview.modulate = Color.WHITE if unlocked else Color(0.35, 0.35, 0.35, 0.85)

	_name_lbl.text = I18n.t(cur["name_key"]) + ("" if unlocked else " 🔒")
	_desc_lbl.text = I18n.t(cur["desc_key"])
	_trait_lbl.text = I18n.t(cur["trait_key"])

	_confirm_btn.disabled = not unlocked
	_confirm_btn.label = I18n.t("characterSelect.confirm") if unlocked else I18n.t("characterSelect.locked")


func _build_tier_row() -> void:
	for child in _tier_row.get_children():
		child.queue_free()
	_tier_buttons.clear()
	for t in TIERS:
		var td: Dictionary = t as Dictionary
		var btn: Control = Control.new()
		btn.set_script(FramedButton)
		btn.custom_minimum_size = Vector2(200, 72)
		btn.color = "orange"
		btn.label = I18n.t(td["label_key"])
		btn.label_font_size = 22
		if ResourceLoader.exists(td["icon"]):
			btn.icon = load(td["icon"])
		btn.pressed.connect(_on_tier_pressed.bind(int(td["id"])))
		_tier_row.add_child(btn)
		_tier_buttons.append(btn)
	_refresh_tier_selection()


func _on_tier_pressed(tier: int) -> void:
	Audio.play_sfx("ui_click")
	_selected_tier = tier
	_refresh_tier_selection()


func _refresh_tier_selection() -> void:
	for i in _tier_buttons.size():
		var b = _tier_buttons[i]
		var is_sel: bool = (i + 1) == _selected_tier
		# 用 yellow（选中）/ orange（未选）区分难度选中态。
		b.color = "yellow" if is_sel else "orange"
		b.scale = Vector2(1.06, 1.06) if is_sel else Vector2.ONE


func _on_back() -> void:
	Audio.play_sfx("ui_click")
	get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")


func _on_confirm() -> void:
	Audio.play_sfx("ui_click")
	var cur: Dictionary = CHARS[_selected_char_idx]
	if not (cur["id"] in _unlocked_ids()):
		return
	GameManager.selected_character = cur["id"]
	GameManager.selected_tier = _selected_tier
	get_tree().change_scene_to_file("res://scenes/main.tscn")
