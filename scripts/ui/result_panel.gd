extends CanvasLayer
## 结算面板。旧版 GameInstance.getResult()。
## 玩家死亡 / Boss 击败后弹，显示存活时间、等级、击杀、掉落银币，写入 SaveGame。

@onready var _panel: Control = $Panel
@onready var _title: Label = $Panel/VBox/Title
@onready var _stats: Label = $Panel/VBox/Stats
@onready var _btn: Button = $Panel/VBox/RestartBtn


func _ready() -> void:
	_panel.visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	var player: Node = get_tree().get_first_node_in_group("player")
	if player and player.has_signal("died"):
		player.died.connect(_on_died)
	_btn.pressed.connect(_on_restart_pressed)


func _on_died() -> void:
	_show_result("YOU DIED", "victory: false")


func _show_result(title: String, _extra: String) -> void:
	var player: Node = get_tree().get_first_node_in_group("player")
	var kills: int = 0
	var level: int = 1
	var run_secs: float = GameManager.run_seconds
	if player:
		kills = int(player.kill_count)
		level = int(player.level)
	var base_silver: int = int(floor(kills * 0.5 + level * 5))
	var total_silver: int = base_silver + GameManager.run_silver
	SaveGame.add_silver(total_silver)
	SaveGame.record_run_end(run_secs, level, kills)
	_title.text = title
	@warning_ignore("integer_division")
	var minutes: int = int(run_secs) / 60
	var seconds: int = int(run_secs) % 60
	_stats.text = "存活: %02d:%02d\n等级: %d\n击杀: %d\n局内银币: %d\n结算银币: %d" % [
		minutes, seconds,
		level, kills, GameManager.run_silver, total_silver,
	]
	_panel.visible = true
	get_tree().paused = true


func _on_restart_pressed() -> void:
	get_tree().paused = false
	_panel.visible = false
	Quests.check_completions()
	get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")
