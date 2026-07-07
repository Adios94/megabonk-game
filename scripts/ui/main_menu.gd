extends Control
## 主菜单：Play / Shop / Quests / 角色选择 / 难度选择 / Quit。

@onready var _character_option: OptionButton = $VBox/CharBox/CharOption
@onready var _tier_option: OptionButton = $VBox/TierBox/TierOption
@onready var _silver_label: Label = $VBox/SilverLabel

@onready var _shop_panel: Node = $ShopPanel
@onready var _quest_panel: Node = $QuestPanel


func _ready() -> void:
	_populate_character()
	_populate_tier()
	_update_silver()
	Audio.play_music("begin", 1.0)
	$VBox/PlayBtn.pressed.connect(_on_play)
	$VBox/ShopBtn.pressed.connect(_on_shop)
	$VBox/QuestBtn.pressed.connect(_on_quest)
	$VBox/QuitBtn.pressed.connect(_on_quit)
	if _shop_panel:
		_shop_panel.visible = false
	if _quest_panel:
		_quest_panel.visible = false


func _populate_character() -> void:
	_character_option.clear()
	var unlocked: Array = SaveGame.data.get("characters_unlocked", []) as Array
	var i: int = 0
	for c in ["megachad", "roberto", "skateboard_skeleton"]:
		var label: String = I18n.t("character.%s" % c)
		if label.begins_with("character."):
			label = c.capitalize()
		if not c in unlocked:
			label += " (锁)"
			_character_option.add_item(label, i)
			_character_option.set_item_disabled(i, true)
		else:
			_character_option.add_item(label, i)
		i += 1


func _populate_tier() -> void:
	_tier_option.clear()
	_tier_option.add_item("Tier 1 · Normal", 1)
	_tier_option.add_item("Tier 2 · Hard", 2)
	_tier_option.add_item("Tier 3 · Nightmare", 3)


func _update_silver() -> void:
	_silver_label.text = "银币: %d" % SaveGame.get_silver()


func _on_play() -> void:
	Audio.play_sfx("ui_click")
	var char_idx: int = _character_option.selected
	var char_ids: Array = ["megachad", "roberto", "skateboard_skeleton"]
	var char_id: String = char_ids[char_idx] if char_idx >= 0 and char_idx < char_ids.size() else "megachad"
	var tier: int = _tier_option.get_item_id(_tier_option.selected) if _tier_option.selected >= 0 else 1
	GameManager.selected_character = char_id
	GameManager.selected_tier = tier
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
