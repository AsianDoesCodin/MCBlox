package com.mcblox.mod.mixin;

import com.mcblox.mod.McBloxModClient;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
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

    // Intercept setScreen() — when TitleScreen is about to be shown, redirect
    @Inject(method = "setScreen", at = @At("HEAD"), cancellable = true)
    private void mcblox_onSetScreen(Screen screen, CallbackInfo ci) {
        if (McBloxModClient.config == null || McBloxModClient.skipAttempted) return;
        if (!(screen instanceof TitleScreen)) return;

        McBloxModClient.skipAttempted = true;
        MinecraftClient mc = (MinecraftClient) (Object) this;
        McBloxModClient.McBloxConfig cfg = McBloxModClient.config;

        if ("server".equals(cfg.gameType) && cfg.serverAddress != null) {
            ci.cancel();
            ServerAddress addr = ServerAddress.parse(cfg.serverAddress);
            ServerInfo info = new ServerInfo("McBlox Server", cfg.serverAddress, ServerInfo.ServerType.OTHER);
            mc.send(() -> {
                try {
                    ConnectScreen.connect(new TitleScreen(), mc, addr, info, false, null);
                } catch (Exception e) {
                    e.printStackTrace();
                    McBloxModClient.skipAttempted = false;
                    mc.setScreen(new TitleScreen());
                }
            });
        } else if ("world".equals(cfg.gameType) && cfg.worldName != null) {
            ci.cancel();
            mc.send(() -> {
                try {
                    mc.createIntegratedServerLoader().start(cfg.worldName, () -> {
                        McBloxModClient.skipAttempted = false;
                        mc.setScreen(new TitleScreen());
                    });
                } catch (Exception e) {
                    e.printStackTrace();
                    McBloxModClient.skipAttempted = false;
                    mc.setScreen(new TitleScreen());
                }
            });
        }
    }
}
