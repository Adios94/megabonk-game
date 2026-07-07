extends CanvasLayer
## 局内 HUD。HP 条 + XP 条 + Level + 击杀数 + 计时器 + 死亡遮罩。

@export var player_path: NodePath

@onready var _hp_bar: TextureProgressBar = $HpBar
@onready var _hp_label: Label = $HpBar/Label
@onready var _xp_bar: TextureProgressBar = $XpBar
@onready var _xp_label: Label = $XpBar/Label
@onready var _level_label: Label = $LevelLabel
@onready var _kill_label: Label = $KillLabel
@onready var _time_label: Label = $TimeLabel
@onready var _death_panel: Control = $DeathPanel
@onready var _boss_hp_container: Control = $BossHp
@onready var _boss_hp_bar: TextureProgressBar = $BossHp/Bar
@onready var _boss_phase_label: Label = $BossHp/PhaseLabel
@onready var _final_swarm_label: Label = $FinalSwarmLabel

var _player: Node
var _boss: Node
var _final_swarm_shown: bool = false


func _ready() -> void:
	_death_panel.visible = false
	_boss_hp_container.visible = false
	if is_instance_valid(_final_swarm_label):
		_final_swarm_label.visible = false
	if player_path.is_empty():
		_player = get_tree().get_first_node_in_group("player")
	else:
		_player = get_node_or_null(player_path)
	if _player:
		_player.hp_changed.connect(_on_hp_changed)
		_player.xp_changed.connect(_on_xp_changed)
		_player.kill_count_changed.connect(_on_kill_changed)
		_player.died.connect(_on_died)
		_on_hp_changed(float(_player.hp), float(_player.get_max_hp()))
		_on_xp_changed(int(_player.xp), int(_player.xp_to_next), int(_player.level))
		_on_kill_changed(int(_player.kill_count))

	# 监听 Boss spawn
	if not EventBus.boss_spawned.is_connected(_on_boss_spawned):
		EventBus.boss_spawned.connect(_on_boss_spawned)


func _on_boss_spawned(boss) -> void:
	_boss = boss
	if boss == null:
		return
	_boss_hp_container.visible = true
	if boss.has_signal("hp_changed"):
		boss.hp_changed.connect(_on_boss_hp_changed)


func _on_boss_hp_changed(hp: float, max_hp: float, phase: int) -> void:
	_boss_hp_bar.max_value = max_hp
	_boss_hp_bar.value = hp
	_boss_phase_label.text = "BOSS · P%d" % phase
	if hp <= 0.0:
		_boss_hp_container.visible = false


func _process(_delta: float) -> void:
	var t: float = GameManager.run_seconds
	@warning_ignore("integer_division")
	var m: int = int(t) / 60
	var s: int = int(t) % 60
	_time_label.text = "%02d:%02d" % [m, s]
	# Final Swarm 横幅 3 秒
	if not _final_swarm_shown and t >= GameConfig.FINAL_SWARM_START_TIME:
		_final_swarm_shown = true
		_show_final_swarm_banner()


func _show_final_swarm_banner() -> void:
	if not is_instance_valid(_final_swarm_label):
		return
	_final_swarm_label.visible = true
	_final_swarm_label.modulate.a = 1.0
	var tw: Tween = create_tween()
	tw.tween_interval(2.0)
	tw.tween_property(_final_swarm_label, "modulate:a", 0.0, 1.0)
	tw.tween_callback(func(): _final_swarm_label.visible = false)


func _on_hp_changed(hp: float, max_hp: float) -> void:
	_hp_bar.max_value = max_hp
	_hp_bar.value = hp
	_hp_label.text = "%d / %d" % [int(round(hp)), int(round(max_hp))]


func _on_xp_changed(xp: int, xp_to_next: int, level: int) -> void:
	_xp_bar.max_value = xp_to_next
	_xp_bar.value = xp
	_xp_label.text = "%d / %d" % [xp, xp_to_next]
	_level_label.text = "Lv %d" % level


func _on_kill_changed(count: int) -> void:
	_kill_label.text = "杀 %d" % count


func _on_died() -> void:
	# 死亡遮罩交给 ResultPanel 处理，HUD 里只藏血条以外的东西
	pass
