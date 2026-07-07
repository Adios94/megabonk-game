extends CanvasLayer
## Shrine 4 选 1 面板。show_options(luck, callback) 弹面板，玩家点选 → callback(reward_dict)。

@onready var _panel: Control = $Panel
@onready var _title: Label = $Panel/VBox/Title
@onready var _cards: Array = [
	$Panel/VBox/HBox/Card1,
	$Panel/VBox/HBox/Card2,
	$Panel/VBox/HBox/Card3,
	$Panel/VBox/HBox/Card4,
]

var _options: Array = []
var _callback: Callable
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_panel.visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	for i in _cards.size():
		var b: Button = _cards[i] as Button
		b.pressed.connect(_on_pressed.bind(i))


func show_options(luck_level: int, callback: Callable) -> void:
	_options = ShrineRewards.roll_options(4, luck_level, _rng)
	_callback = callback
	_title.text = "充能神殿 · 选择祝福"
	for i in _cards.size():
		var b: Button = _cards[i] as Button
		if i >= _options.size():
			b.visible = false
			continue
		b.visible = true
		b.text = _describe(_options[i])
	_panel.visible = true
	get_tree().paused = true


func _describe(opt: Dictionary) -> String:
	var reward: String = opt["reward"]
	var value: float = float(opt["value"])
	var rarity: String = opt["rarity"]
	var tag: String = "★" if rarity == "legendary" else ("◆" if rarity == "rare" else ("+" if rarity == "uncommon" else "•"))
	var label: String = _reward_label(reward, value)
	return "%s\n%s" % [tag, label]


func _reward_label(reward: String, value: float) -> String:
	match reward:
		"damage": return "+%d%% 伤害" % int(round(value * 100))
		"attack_speed": return "+%d%% 攻速" % int(round(value * 100))
		"movement_speed": return "+%d%% 移速" % int(round(value * 100))
		"pickup_range": return "+%d%% 拾取范围" % int(round(value * 100))
		"crit_damage": return "+%d%% 暴击伤害" % int(round(value * 100))
		"knockback": return "+%d%% 击退" % int(round(value * 100))
		"lifesteal": return "+%d%% 生命偷取" % int(round(value * 100))
		"luck": return "+%d%% 幸运" % int(round(value * 100))
		"elite_damage": return "+%d%% 精英伤害" % int(round(value * 100))
		"shield": return "+%d 护盾" % int(value)
		"hp_regen": return "+%d HP/s" % int(value)
		"projectile_count": return "+%d 投射物" % int(value)
		"difficulty": return "+%d%% 难度" % int(round(value * 100))
		"powerup_multiplier": return "+%d%% 强化倍率" % int(round(value * 100))
		"duration": return "+%d%% 持续时间" % int(round(value * 100))
		"jump_height": return "+%d%% 跳跃高度" % int(round(value * 100))
	return "%s +%.2f" % [reward, value]


func _on_pressed(idx: int) -> void:
	if idx >= _options.size():
		return
	var picked: Dictionary = _options[idx]
	_panel.visible = false
	get_tree().paused = false
	if _callback.is_valid():
		_callback.call(picked)
