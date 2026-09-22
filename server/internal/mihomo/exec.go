package mihomo

import (
	"bytes"
	"context"
	"os/exec"
)

// runCommand executes the binary with an argument array against a context,
// capturing both streams. The config path arrives as an argv element — a
// shell would turn a crafted filename into command execution, and there is no
// reason to introduce one for a fixed two-argument invocation.
func runCommand(ctx context.Context, binaryPath string, args ...string) (stdout, stderr string, exitCode int, err error) {
	cmd := exec.CommandContext(ctx, binaryPath, args...)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err = cmd.Run()
	stdout = outBuf.String()
	stderr = errBuf.String()

	if err != nil {
		exitCode = cmd.ProcessState.ExitCode()
		if exitCode < 0 {
			// Killed by a signal (timeout, OOM): report -1 rather than leak
			// signal numbers into an API field.
			exitCode = -1
		}
	}
	return stdout, stderr, exitCode, err
}
