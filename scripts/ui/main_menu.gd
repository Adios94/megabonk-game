extends Control
## 主菜单：3 角色卡片（左中右）+ 难度选择 + Play/Shop/Quest/Quit

const CHARS := [
	{
		"id": "megachad",
		"name_key": "character.megachad",
		"desc_key": "character.megachad_desc",
		"trait_key": "character.megachad_trait",
		"full": "res://assets/ui/characters/megachad_full.webp",
	},
	{
		"id": "roberto",
		"name_key": "character.roberto",
		"desc_key": "character.roberto_desc",
		"trait_key": "character.roberto_trait",
		"full": "res://assets/ui/characters/roberto_full.webp",
	},
	{
		"id": "skateboard_skeleton",
		"name_key": "character.skateboard_skeleton",
		"desc_key": "character.skateboard_skeleton_desc",
		"trait_key": "character.skateboard_skeleton_trait",
		"full": "res://assets/ui/characters/skateboard_skeleton_full.webp",
	},
]

const TIERS := [
	{"id": 1, "label": "Normal", "icon": "res://assets/ui/icon/difficulty_normal.png"},
	{"id": 2, "label": "Hard", "icon": "res://assets/ui/icon/difficulty_hard.png"},
	{"id": 3, "label": "Nightmare", "icon": "res://assets/ui/icon/difficulty_nightmare.png"},
]

@onready var _char_row: HBoxContainer = $CharRow
@onready var _tier_row: HBoxContainer = $BottomBox/TierRow
@onready var _silver_label: Label = $TopBar/SilverLabel
@onready var _play_btn: Button = $BottomBox/PlayBtn
@onready var _shop_btn: Button = $TopBar/ShopBtn
@onready var _quest_btn: Button = $TopBar/QuestBtn
@onready var _quit_btn: Button = $TopBar/QuitBtn

@onready var _shop_panel: Node = $ShopPanel
@onready var _quest_panel: Node = $QuestPanel

var _selected_char_idx: int = 0
var _selected_tier: int = 1
var _char_cards: Array = []


func _ready() -> void:
	Audio.play_music("begin", 1.0)
	_update_silver()
	_build_char_cards()
	_build_tier_row()
	_play_btn.pressed.connect(_on_play)
	_shop_btn.pressed.connect(_on_shop)
	_quest_btn.pressed.connect(_on_quest)
	_quit_btn.pressed.connect(_on_quit)
	if _shop_panel:
		_shop_panel.visible = false
	if _quest_panel:
		_quest_panel.visible = false


func _build_char_cards() -> void:
	_char_cards.clear()
	for child in _char_row.get_children():
		child.queue_free()
	var unlocked: Array = SaveGame.data.get("characters_unlocked", []) as Array
	for i in CHARS.size():
		var c: Dictionary = CHARS[i]
		var card: Control = _make_char_card(c, i, c["id"] in unlocked)
		_char_row.add_child(card)
		_char_cards.append(card)
	_refresh_char_selection()


func _make_char_card(c: Dictionary, idx: int, unlocked: bool) -> Control:
	var panel: PanelContainer = PanelContainer.new()
	panel.custom_minimum_size = Vector2(280, 460)

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	panel.add_child(vbox)

	# Full body 图（占大部分）
	var img: TextureRect = TextureRect.new()
	img.custom_minimum_size = Vector2(260, 320)
	img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if ResourceLoader.exists(c["full"]):
		img.texture = load(c["full"])
	if not unlocked:
		img.modulate = Color(0.3, 0.3, 0.3, 0.7)
	vbox.add_child(img)

	# Name
	var name_lbl: Label = Label.new()
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.add_theme_font_size_override("font_size", 24)
	var name_text: String = I18n.t(c["name_key"])
	if name_text.begins_with("character."):
		name_text = str(c["id"]).capitalize()
	if not unlocked:
		name_text += " 🔒"
	name_lbl.text = name_text
	vbox.add_child(name_lbl)

	# Trait desc
	var trait_lbl: Label = Label.new()
	trait_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	trait_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	trait_lbl.add_theme_font_size_override("font_size", 13)
	trait_lbl.add_theme_color_override("font_color", Color(0.85, 0.9, 0.6))
	var trait_text: String = I18n.t(c["trait_key"])
	if trait_text.begins_with("character."):
		trait_text = ""
	trait_lbl.text = trait_text
	trait_lbl.custom_minimum_size = Vector2(0, 44)
	vbox.add_child(trait_lbl)

	# Overlay button
	var btn: Button = Button.new()
	btn.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	btn.flat = true
	btn.disabled = not unlocked
	btn.pressed.connect(_on_char_pressed.bind(idx))
	panel.add_child(btn)

	return panel


func _on_char_pressed(idx: int) -> void:
	Audio.play_sfx("ui_click")
	_selected_char_idx = idx
	_refresh_char_selection()


func _refresh_char_selection() -> void:
	for i in _char_cards.size():
		var card: PanelContainer = _char_cards[i] as PanelContainer
		if i == _selected_char_idx:
			card.modulate = Color(1.15, 1.15, 1.15)
		else:
			card.modulate = Color(0.7, 0.7, 0.7)


func _build_tier_row() -> void:
	for child in _tier_row.get_children():
		child.queue_free()
	for t in TIERS:
		var td: Dictionary = t as Dictionary
		var btn: Button = Button.new()
		btn.custom_minimum_size = Vector2(140, 60)
		if ResourceLoader.exists(td["icon"]):
			btn.icon = load(td["icon"])
			btn.expand_icon = true
		btn.text = td["label"]
		btn.pressed.connect(_on_tier_pressed.bind(int(td["id"])))
		_tier_row.add_child(btn)
	_refresh_tier_selection()


func _on_tier_pressed(tier: int) -> void:
	Audio.play_sfx("ui_click")
	_selected_tier = tier
	_refresh_tier_selection()


func _refresh_tier_selection() -> void:
	var i: int = 0
	for child in _tier_row.get_children():
		var btn: Button = child as Button
		if i + 1 == _selected_tier:
			btn.modulate = Color(1.3, 1.1, 0.6)
		else:
			btn.modulate = Color(0.85, 0.85, 0.85)
		i += 1


func _update_silver() -> void:
	_silver_label.text = "💰 %d" % SaveGame.get_silver()


func _on_play() -> void:
	Audio.play_sfx("ui_click")
	GameManager.selected_character = CHARS[_selected_char_idx]["id"]
	GameManager.selected_tier = _selected_tier
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func _on_shop() -> void:
	Audio.play_sfx("ui_click")
	if _shop_panel and _shop_panel.has_method("open"):
		_shop_panel.open()
		_shop_panel.closed.connect(_update_silver, CONNECT_ONE_SHOT)


func _on_quest() -> void:
	Audio.play_sfx("ui_click")
	if _quest_panel and _quest_panel.has_method("open"):
		_quest_panel.open()
		_quest_panel.closed.connect(_update_silver, CONNECT_ONE_SHOT)


func _on_quit() -> void:
	Audio.play_sfx("ui_click")
	get_tree().quit()
