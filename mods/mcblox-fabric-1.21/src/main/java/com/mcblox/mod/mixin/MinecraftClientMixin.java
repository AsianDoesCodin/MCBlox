package com.mcblox.mod.mixin;

import com.mcblox.mod.McBloxModClient;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MinecraftClient.class)
public class MinecraftClientMixin {

    @Inject(method = "tick", at = @At("HEAD"))
    private void mcblox_onTick(CallbackInfo ci) {
        if (McBloxModClient.config == null || McBloxModClient.autoJoinDone) return;

        MinecraftClient mc = (MinecraftClient) (Object) this;
        if (!(mc.currentScreen instanceof TitleScreen)) return;

        McBloxModClient.tickDelay++;
        if (McBloxModClient.tickDelay < 20) return;

        McBloxModClient.autoJoinDone = true;
        McBloxModClient.McBloxConfig cfg = McBloxModClient.config;

        if ("server".equals(cfg.gameType) && cfg.serverAddress != null) {
            ServerAddress addr = ServerAddress.parse(cfg.serverAddress);
            ServerInfo info = new ServerInfo("McBlox Server", cfg.serverAddress, ServerInfo.ServerType.OTHER);
            ConnectScreen.connect(mc.currentScreen, mc, addr, info, false, null);
        } else if ("world".equals(cfg.gameType) && cfg.worldName != null) {
            mc.createIntegratedServerLoader().start(cfg.worldName, () -> {
                mc.setScreen(new TitleScreen());
            });
        }
    }
}
