extends CanvasLayer
## 升级面板。玩家 leveled_up 时暂停游戏，弹出 3 张卡片。

@onready var _panel: Control = $Panel
@onready var _cards: Array = [$Panel/HBox/Card1, $Panel/HBox/Card2, $Panel/HBox/Card3]
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
	for i in _cards.size():
		var btn: Button = _cards[i] as Button
		btn.pressed.connect(_on_card_pressed.bind(i))


func _on_leveled_up(new_level: int) -> void:
	_title.text = "Level Up! → %d" % new_level
	_pending_options = _roll_options()
	if _pending_options.is_empty():
		return
	_update_cards()
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


func _update_cards() -> void:
	for i in _cards.size():
		var card: Button = _cards[i] as Button
		if i >= _pending_options.size():
			card.visible = false
			continue
		card.visible = true
		var opt: Dictionary = _pending_options[i]
		card.text = _describe_option(opt)


func _describe_option(opt: Dictionary) -> String:
	var kind: String = opt["kind"]
	var id: String = opt["id"]
	var rarity: String = opt["rarity"]
	match kind:
		"new_weapon":
			return "%s\n[新武器]\n%s" % [_i18n_weapon(id), _rarity_tag(rarity)]
		"weapon_upgrade":
			var cur: int = _get_weapon_level(id)
			return "%s\n[Lv %d → %d]\n%s" % [_i18n_weapon(id), cur, cur + 1, _rarity_tag(rarity)]
		"tome":
			var cur: int = _get_tome_level(id)
			return "%s\n[Lv %d → %d]\n%s" % [_i18n_tome(id), cur, cur + 1, _rarity_tag(rarity)]
	return str(opt)


func _rarity_tag(r: String) -> String:
	if r == "legendary":
		return "★"
	if r == "rare":
		return "◆"
	return "•"


func _i18n_weapon(id: String) -> String:
	var text_val: String = I18n.t("weapon.%s.name" % id)
	if text_val.begins_with("weapon."):
		return id.replace("_", " ").capitalize()
	return text_val


func _i18n_tome(id: String) -> String:
	var text_val: String = I18n.t("weapon.tome.%s" % id)
	if text_val.begins_with("weapon.tome."):
		return id.replace("_", " ").capitalize()
	return text_val


func _get_weapon_level(weapon_type: String) -> int:
	for w in _player.weapons:
		if (w as Dictionary)["type"] == weapon_type:
			return int((w as Dictionary)["level"])
	return 0


func _on_card_pressed(index: int) -> void:
	if index >= _pending_options.size():
		return
	var opt: Dictionary = _pending_options[index]
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
