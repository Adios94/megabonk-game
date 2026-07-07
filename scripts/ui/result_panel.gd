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
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_signal("died"):
		player.died.connect(_on_died)
	_btn.pressed.connect(_on_restart_pressed)


func _on_died() -> void:
	_show_result("YOU DIED", "victory: false")


func _show_result(title: String, _extra: String) -> void:
	var player := get_tree().get_first_node_in_group("player")
	var kills := 0
	var level := 1
	var run_secs := GameManager.run_seconds
	if player:
		kills = player.kill_count
		level = player.level
	var base_silver: int = int(floor(kills * 0.5 + level * 5))
	SaveGame.add_silver(base_silver)
	SaveGame.record_run_end(run_secs, level, kills)
	_title.text = title
	_stats.text = "存活: %02d:%02d\n等级: %d\n击杀: %d\n获得银币: %d" % [
		int(run_secs) / 60, int(run_secs) % 60,
		level, kills, base_silver,
	]
	_panel.visible = true
	get_tree().paused = true


func _on_restart_pressed() -> void:
	get_tree().paused = false
	_panel.visible = false
	get_tree().reload_current_scene()
