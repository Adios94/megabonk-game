extends CanvasLayer
## 升级面板。玩家 leveled_up 时暂停游戏，弹出 3 张卡片（rarity 边框 + icon + 名称 + 描述）。

const FRAME_UIDS := {
	"common": "res://assets/ui/panel/svg/frame_upgrade_common.svg",
	"uncommon": "res://assets/ui/panel/svg/frame_upgrade_uncommon.svg",
	"rare": "res://assets/ui/panel/svg/frame_upgrade_rare.svg",
	"legendary": "res://assets/ui/panel/svg/frame_upgrade_legendary.svg",
}

@onready var _panel: Control = $Panel
@onready var _cards_hbox: HBoxContainer = $Panel/CardsHBox
@onready var _title: Label = $Panel/Title

var _pending_options: Array = []
var _player: Node
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_panel.visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	_player = get_tree().get_first_node_in_group("player")
	if _player and _player.has_signal("leveled_up"):
		_player.leveled_up.connect(_on_leveled_up)


func _on_leveled_up(new_level: int) -> void:
	_title.text = "Level Up! → %d" % new_level
	_pending_options = _roll_options()
	if _pending_options.is_empty():
		return
	_rebuild_cards()
	_panel.visible = true
	get_tree().paused = true


func _roll_options() -> Array:
	if _player == null:
		return []
	var state: Dictionary = {
		"weapons": _player.weapons,
		"tomes": _player.tomes,
		"max_weapon_slots": _player.max_weapon_slots,
		"luck_level": _get_tome_level("luck_tome"),
	}
	return Upgrades.generate_options(state, 3, _rng)


func _get_tome_level(tome_type: String) -> int:
	for t in _player.tomes:
		if (t as Dictionary)["type"] == tome_type:
			return int((t as Dictionary)["level"])
	return 0


func _rebuild_cards() -> void:
	for child in _cards_hbox.get_children():
		child.queue_free()
	for i in _pending_options.size():
		var opt: Dictionary = _pending_options[i]
		var card: Control = _make_card(opt, i)
		_cards_hbox.add_child(card)


func _make_card(opt: Dictionary, idx: int) -> Control:
	var frame: NinePatchRect = NinePatchRect.new()
	frame.custom_minimum_size = Vector2(280, 340)
	frame.texture = load(FRAME_UIDS.get(opt["rarity"], FRAME_UIDS["common"]))
	frame.patch_margin_left = 24
	frame.patch_margin_top = 24
	frame.patch_margin_right = 24
	frame.patch_margin_bottom = 24

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vbox.offset_left = 24
	vbox.offset_top = 24
	vbox.offset_right = -24
	vbox.offset_bottom = -24
	vbox.add_theme_constant_override("separation", 10)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	frame.add_child(vbox)

	# Rarity label（顶部）
	var rarity_label: Label = Label.new()
	rarity_label.text = _rarity_text(opt["rarity"])
	rarity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rarity_label.add_theme_font_size_override("font_size", 14)
	rarity_label.add_theme_color_override("font_color", _rarity_color(opt["rarity"]))
	vbox.add_child(rarity_label)

	# Icon（中间大图 96x96）
	var icon: TextureRect = TextureRect.new()
	icon.custom_minimum_size = Vector2(96, 96)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var icon_path: String = _icon_path(opt)
	if ResourceLoader.exists(icon_path):
		icon.texture = load(icon_path)
	vbox.add_child(icon)

	# Name
	var name_lbl: Label = Label.new()
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.add_theme_font_size_override("font_size", 22)
	name_lbl.text = _title_text(opt)
	name_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_lbl.custom_minimum_size = Vector2(0, 32)
	vbox.add_child(name_lbl)

	# Description
	var desc: Label = Label.new()
	desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	desc.add_theme_font_size_override("font_size", 14)
	desc.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
	desc.text = _desc_text(opt)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.custom_minimum_size = Vector2(0, 60)
	vbox.add_child(desc)

	# Button 覆盖整卡
	var btn: Button = Button.new()
	btn.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	btn.flat = true
	btn.pressed.connect(_on_card_pressed.bind(idx))
	frame.add_child(btn)

	return frame


func _rarity_text(r: String) -> String:
	match r:
		"legendary": return "★ 传说"
		"rare": return "◆ 稀有"
		"uncommon": return "▲ 优秀"
	return "● 普通"


func _rarity_color(r: String) -> Color:
	match r:
		"legendary": return Color(1.0, 0.7, 0.2)
		"rare": return Color(0.5, 0.7, 1.0)
		"uncommon": return Color(0.5, 0.9, 0.5)
	return Color(0.8, 0.8, 0.8)


func _icon_path(opt: Dictionary) -> String:
	var kind: String = opt["kind"]
	var id: String = opt["id"]
	match kind:
		"new_weapon", "weapon_upgrade":
			return "res://assets/ui/icon/weapon/%s.png" % id
		"tome":
			return "res://assets/ui/icon/tome/%s.png" % id
	return ""


func _title_text(opt: Dictionary) -> String:
	var kind: String = opt["kind"]
	var id: String = opt["id"]
	match kind:
		"new_weapon":
			var n: String = I18n.t("weapon.%s.name" % id)
			return n if not n.begins_with("weapon.") else id.replace("_", " ").capitalize()
		"weapon_upgrade":
			var n2: String = I18n.t("weapon.%s.name" % id)
			return n2 if not n2.begins_with("weapon.") else id.replace("_", " ").capitalize()
		"tome":
			var n3: String = I18n.t("weapon.tome.%s" % id)
			return n3 if not n3.begins_with("weapon.tome.") else id.replace("_", " ").capitalize()
	return id


func _desc_text(opt: Dictionary) -> String:
	var kind: String = opt["kind"]
	var id: String = opt["id"]
	match kind:
		"new_weapon":
			return "全新武器 · Lv 1"
		"weapon_upgrade":
			var cur: int = _get_weapon_level(id)
			return "武器升级\n%d → %d 级" % [cur, cur + 1]
		"tome":
			var cur2: int = _get_tome_level(id)
			var desc_key: String = "weapon.tome.%s_desc" % id
			var desc: String = I18n.t(desc_key)
			if desc.begins_with("weapon.tome."):
				desc = "Lv %d → %d" % [cur2, cur2 + 1]
			else:
				desc += "\nLv %d → %d" % [cur2, cur2 + 1]
			return desc
	return ""


func _get_weapon_level(weapon_type: String) -> int:
	for w in _player.weapons:
		if (w as Dictionary)["type"] == weapon_type:
			return int((w as Dictionary)["level"])
	return 0


func _on_card_pressed(index: int) -> void:
	if index >= _pending_options.size():
		return
	var opt: Dictionary = _pending_options[index]
	Audio.play_sfx("ui_select")
	_apply_option(opt)
	_panel.visible = false
	get_tree().paused = false


func _apply_option(opt: Dictionary) -> void:
	if _player == null:
		return
	match opt["kind"]:
		"new_weapon":
			_player.add_weapon(opt["id"], 1)
		"weapon_upgrade":
			_player.upgrade_weapon(opt["id"])
		"tome":
			_player.add_or_upgrade_tome(opt["id"])
